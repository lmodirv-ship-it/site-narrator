// Hn-MAKER recorder pipeline (v2).
//
// Given a "scene plan" — list of { url, narration:{ar,en,fr}, durationSec? } —
// this module:
//   1. Generates ElevenLabs TTS for every (scene × language).
//   2. Records a single Playwright session that navigates through every scene,
//      with an animated on-screen cursor, gentle scrolling, and dynamic pacing
//      so visual duration matches the longest narration of that scene.
//   3. Concatenates the recorded segments into a silent base video.
//   4. For each language: concats the per-scene audio (padded with silence),
//      builds an SRT subtitle file, and muxes audio+video — optionally burning
//      the subtitles into the picture.
//   5. Writes script-<lang>.txt and video-info.txt next to the MP4s.
//
// All heavy lifting (Playwright, FFmpeg, ElevenLabs) stays on this local server.
// The web UI just submits the plan and watches SSE progress.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // Sarah (multilingual v2)
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

// Injected before any page script runs. Adds a large pink cursor + click ring.
const CURSOR_INIT_SCRIPT = `
(() => {
  if (window.__hnCursorInstalled) return;
  window.__hnCursorInstalled = true;
  const install = () => {
    if (!document.documentElement) return;
    const c = document.createElement('div');
    c.id = '__hn_cursor';
    c.style.cssText = 'position:fixed;left:50%;top:50%;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle, rgba(255,80,160,.95), rgba(255,80,160,0) 70%);border:2px solid rgba(255,255,255,.95);box-shadow:0 0 18px rgba(255,80,160,.6);pointer-events:none;z-index:2147483647;transition:left .35s ease-out, top .35s ease-out;transform:translate(-50%,-50%);';
    const ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;left:50%;top:50%;width:30px;height:30px;border:2px solid rgba(255,80,160,.7);border-radius:50%;opacity:0;transform:translate(-50%,-50%) scale(1);pointer-events:none;';
    c.appendChild(ring);
    document.documentElement.appendChild(c);
    window.__hnMove = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px'; };
    window.__hnClick = () => {
      ring.style.transition = 'none';
      ring.style.opacity = '1';
      ring.style.transform = 'translate(-50%,-50%) scale(.6)';
      requestAnimationFrame(() => {
        ring.style.transition = 'all .7s ease-out';
        ring.style.transform = 'translate(-50%,-50%) scale(3)';
        ring.style.opacity = '0';
      });
    };
  };
  if (document.documentElement) install();
  else document.addEventListener('DOMContentLoaded', install);
})();
`;

async function ttsElevenLabs(text) {
  if (!ELEVEN_KEY) throw new Error("ELEVENLABS_API_KEY is not set. Add it to local-server/.env");
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

function ffprobeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=nokey=1:noprint_wrappers=1",
      file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("exit", () => resolve(parseFloat(out.trim()) || 0));
    p.on("error", () => resolve(0));
  });
}

function srtTs(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function shellEscape(p) {
  return p.replace(/'/g, "'\\''");
}

function ffmpegSubFilterPath(p) {
  // FFmpeg subtitles filter needs Windows-style colons escaped.
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function runFfmpeg(args, emit) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    p.stderr.on("data", (d) => emit({ type: "ffmpeg", line: d.toString().slice(0, 240) }));
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    p.on("error", reject);
  });
}

/**
 * @typedef {{
 *   url:string, narration:Record<string,string>, durationSec?:number
 * }} ScenePlan
 *
 * @typedef {{
 *   id:string, url:string, workDir:string, siteName:string,
 *   secondsPerSegment:number, totalSeconds:number,
 *   viewport:{width:number,height:number},
 *   scenes:ScenePlan[], languages:string[], burnSubtitles:boolean,
 *   status:string, segments:string[], startedAt:number, finishedAt:number|null,
 *   finalPath:string|null, infoPath:string|null, error:string|null,
 *   stopRequested:boolean, outputs?:Array<{lang:string,mp4:string,srt:string}>
 * }} Job
 */

export async function runJob(job, emit) {
  const langs = job.languages?.length ? job.languages : ["ar"];
  const scenes = job.scenes?.length
    ? job.scenes
    : [{ url: job.url, narration: { ar: `جولة سريعة في موقع ${job.siteName}.` }, durationSec: 15 }];

  // ===== 1) TTS per (scene, language)
  job.status = "tts";
  emit({ type: "status", status: "tts" });
  const audioDir = path.join(job.workDir, "audio");
  await mkdir(audioDir, { recursive: true });

  /** @type {Record<string, Array<{file:string, dur:number, text:string}>>} */
  const perLang = {};
  for (const lang of langs) {
    perLang[lang] = [];
    for (let i = 0; i < scenes.length; i++) {
      const text = (scenes[i].narration && scenes[i].narration[lang]) || "";
      const file = path.join(audioDir, `s${String(i + 1).padStart(3, "0")}-${lang}.mp3`);
      let dur = 0;
      if (text.trim()) {
        try {
          const buf = await ttsElevenLabs(text);
          await writeFile(file, buf);
          dur = await ffprobeDuration(file);
          emit({ type: "tts", lang, scene: i + 1, total: scenes.length, durSec: dur });
        } catch (e) {
          emit({ type: "ffmpeg", line: `TTS failed scene=${i + 1} lang=${lang}: ${e.message}` });
        }
      }
      perLang[lang].push({ file, dur, text });
    }
  }

  // Per-scene visual duration = max(audio across langs) + 0.6s pad, min 5s
  const sceneDurations = scenes.map((sc, i) => {
    let m = 0;
    for (const l of langs) m = Math.max(m, perLang[l][i]?.dur || 0);
    return Math.max(5, (m || sc.durationSec || 8) + 0.6);
  });

  // ===== 2) Record one continuous Playwright session through every scene
  job.status = "recording";
  emit({ type: "status", status: "recording" });
  const segmentPattern = path.join(job.workDir, "segment-%03d.mp4");
  const ffmpegArgs = [
    "-y",
    "-f", "image2pipe", "-vcodec", "mjpeg", "-r", "15", "-i", "pipe:0",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-g", String(15 * job.secondsPerSegment),
    "-force_key_frames", `expr:gte(t,n_forced*${job.secondsPerSegment})`,
    "-f", "segment", "-segment_time", String(job.secondsPerSegment),
    "-reset_timestamps", "1", "-movflags", "+faststart",
    segmentPattern,
  ];
  const ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: ["pipe", "ignore", "pipe"] });
  ffmpeg.stderr.on("data", (d) => emit({ type: "ffmpeg", line: d.toString().slice(0, 200) }));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: job.viewport });
  await ctx.addInitScript(CURSOR_INIT_SCRIPT);
  const page = await ctx.newPage();

  const session = await ctx.newCDPSession(page);
  await session.send("Page.startScreencast", {
    format: "jpeg", quality: 80, everyNthFrame: 1,
    maxWidth: job.viewport.width, maxHeight: job.viewport.height,
  });
  session.on("Page.screencastFrame", async (frame) => {
    try { ffmpeg.stdin.write(Buffer.from(frame.data, "base64")); } catch { /* pipe closed */ }
    try { await session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }); } catch { /* */ }
  });

  const moveCursor = async (x, y) => {
    try { await page.evaluate(([a, b]) => window.__hnMove && window.__hnMove(a, b), [x, y]); } catch { /* */ }
  };
  const pulseClick = async () => {
    try { await page.evaluate(() => window.__hnClick && window.__hnClick()); } catch { /* */ }
  };

  const recordStart = Date.now();
  for (let i = 0; i < scenes.length; i++) {
    if (job.stopRequested) break;
    const scene = scenes[i];
    const dur = sceneDurations[i];
    emit({ type: "scene", index: i + 1, total: scenes.length, url: scene.url, durSec: dur });
    try {
      await page.goto(scene.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(700);
    } catch (e) {
      emit({ type: "ffmpeg", line: `nav fail ${scene.url}: ${e.message}` });
    }

    const w = job.viewport.width;
    const h = job.viewport.height;
    const steps = Math.max(4, Math.floor(dur / 1.8));
    const points = Array.from({ length: steps }, () => [
      Math.round(w * (0.15 + 0.7 * Math.random())),
      Math.round(h * (0.20 + 0.6 * Math.random())),
    ]);
    const stepMs = Math.max(450, Math.floor((dur * 1000) / (steps + 1)));
    const sceneEnd = Date.now() + Math.floor(dur * 1000);

    let k = 0;
    while (Date.now() < sceneEnd && !job.stopRequested) {
      if (k < points.length) {
        await moveCursor(points[k][0], points[k][1]);
        if (k % 2 === 0) await pulseClick();
        k++;
      }
      try { await page.evaluate((s) => window.scrollBy({ top: s, behavior: "smooth" }), 90); } catch { /* */ }
      await page.waitForTimeout(stepMs);
    }
  }
  const recordedSec = (Date.now() - recordStart) / 1000;

  try { await session.send("Page.stopScreencast"); } catch { /* */ }
  try { await browser.close(); } catch { /* */ }
  try { ffmpeg.stdin.end(); } catch { /* */ }
  await new Promise((r) => ffmpeg.on("exit", r));

  // ===== 3) Concat segments → silent base video
  job.status = "merging";
  emit({ type: "status", status: "merging" });
  const files = (await readdir(job.workDir))
    .filter((f) => /^segment-\d{3}\.mp4$/.test(f))
    .sort();
  job.segments = files;
  if (!files.length) {
    job.status = "failed";
    job.error = "no segments produced";
    emit({ type: "error", message: job.error });
    return;
  }
  const concatVideoList = path.join(job.workDir, "_concat.txt");
  await writeFile(concatVideoList, files.map((f) => `file '${shellEscape(f)}'`).join("\n"));
  const baseVideo = path.join(job.workDir, "_base.mp4");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatVideoList, "-c", "copy", baseVideo], emit);

  // ===== 4) Per-language: build audio track, SRT, mux (and optionally burn subs)
  // Pre-generate 0.5s silence we can repeat as padding.
  const silencePath = path.join(audioDir, "_silence.mp3");
  await runFfmpeg([
    "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
    "-t", "0.5", "-q:a", "9", "-acodec", "libmp3lame", silencePath,
  ], emit);

  /** @type {Array<{lang:string, mp4:string, srt:string, audio:string}>} */
  const outputs = [];
  for (const lang of langs) {
    emit({ type: "status", status: `mux-${lang}` });
    const items = perLang[lang];

    const listLines = [];
    const cues = [];
    let t = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const sceneDur = sceneDurations[i];
      if (it.dur > 0) {
        listLines.push(`file '${shellEscape(it.file)}'`);
        cues.push({ start: t, end: t + it.dur, text: it.text });
        t += it.dur;
      }
      const pad = Math.max(0, sceneDur - it.dur);
      const padCount = Math.ceil(pad / 0.5);
      for (let k = 0; k < padCount; k++) listLines.push(`file '${shellEscape(silencePath)}'`);
      t += padCount * 0.5;
    }

    const audioList = path.join(audioDir, `_track-${lang}.txt`);
    await writeFile(audioList, listLines.join("\n"));
    const audioOut = path.join(audioDir, `track-${lang}.mp3`);
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", audioList, "-c", "copy", audioOut], emit);

    const srtPath = path.join(job.workDir, `final-${lang}.srt`);
    const srt = cues
      .map((c, i) => `${i + 1}\n${srtTs(c.start)} --> ${srtTs(c.end)}\n${c.text}\n`)
      .join("\n");
    await writeFile(srtPath, srt, "utf8");

    const finalPath = path.join(job.workDir, `final-${lang}.mp4`);
    const burn = !!job.burnSubtitles;
    const vf = burn ? ["-vf", `subtitles='${ffmpegSubFilterPath(srtPath)}'`] : [];
    await runFfmpeg([
      "-y",
      "-i", baseVideo,
      "-i", audioOut,
      ...vf,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", burn ? "libx264" : "copy",
      ...(burn ? ["-preset", "veryfast", "-pix_fmt", "yuv420p"] : []),
      "-c:a", "aac", "-b:a", "160k",
      "-shortest", "-movflags", "+faststart",
      finalPath,
    ], emit);

    outputs.push({ lang, mp4: finalPath, srt: srtPath, audio: audioOut });

    await writeFile(
      path.join(job.workDir, `script-${lang}.txt`),
      items.map((it, i) => `# Scene ${i + 1} — ${scenes[i].url}\n${it.text}`).join("\n\n"),
      "utf8",
    );
  }

  job.outputs = outputs;
  job.finalPath = outputs[0]?.mp4 ?? null;

  // ===== 5) Info file
  const infoPath = path.join(job.workDir, "video-info.txt");
  const finishedAt = new Date();
  const info = [
    `Hn-MAKER recording`,
    `--------------------`,
    `الموقع: ${job.siteName}`,
    `الرابط: ${job.url}`,
    `بدأ: ${new Date(job.startedAt).toLocaleString()}`,
    `انتهى: ${finishedAt.toLocaleString()}`,
    `المدة الكلية تقريباً: ${Math.round(recordedSec)} ث`,
    `عدد المشاهد: ${scenes.length}`,
    `عدد أجزاء الفيديو: ${files.length}`,
    `الدقة: ${job.viewport.width}x${job.viewport.height}`,
    `اللغات الناتجة: ${langs.join(", ")}`,
    `ترجمات محروقة على الفيديو: ${job.burnSubtitles ? "نعم" : "لا"}`,
    ``,
    `الملفات:`,
    ...outputs.map((o) => `  - final-${o.lang}.mp4  +  final-${o.lang}.srt  +  script-${o.lang}.txt`),
  ].join("\n");
  await writeFile(infoPath, info, "utf8");
  job.infoPath = infoPath;

  job.status = "done";
  job.finishedAt = finishedAt.getTime();
  emit({ type: "done", finalPath: job.finalPath, infoPath, outputs, segments: files });
}
