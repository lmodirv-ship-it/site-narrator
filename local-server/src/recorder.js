// Playwright + FFmpeg recorder pipeline.
//
// Strategy:
//   1. Launch a headed-or-headless Chromium via Playwright with a fixed viewport.
//   2. Stream raw screencast frames (CDP Page.startScreencast) into FFmpeg's
//      stdin. FFmpeg encodes H.264 MP4 and uses `-f segment` to roll a new
//      file every `secondsPerSegment` seconds (default 30).
//   3. When the job stops (timeout, /stop, or page close), close FFmpeg and
//      concat all segment-XXX.mp4 files into final.mp4. Write video-info.txt.
//
// We never overwrite existing files in workDir other than the segments and
// outputs this job produces.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFile, readdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

/**
 * @typedef {{
 *   id: string, url: string, workDir: string, siteName: string,
 *   secondsPerSegment: number, totalSeconds: number,
 *   viewport: { width: number, height: number },
 *   status: 'starting'|'recording'|'merging'|'done'|'failed'|'stopped',
 *   segments: string[], startedAt: number, finishedAt: number|null,
 *   finalPath: string|null, infoPath: string|null, error: string|null,
 *   stopRequested: boolean,
 * }} Job
 */

/**
 * @param {Job} job
 * @param {(ev: any) => void} emit
 */
export async function runJob(job, emit) {
  const segmentPattern = path.join(job.workDir, "segment-%03d.mp4");
  job.status = "recording";
  emit({ type: "status", status: job.status });

  // 1. FFmpeg: read JPEG frames over stdin, encode to segmented MP4.
  const ffmpegArgs = [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-r", "15",
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-g", String(15 * job.secondsPerSegment),
    "-force_key_frames", `expr:gte(t,n_forced*${job.secondsPerSegment})`,
    "-f", "segment",
    "-segment_time", String(job.secondsPerSegment),
    "-reset_timestamps", "1",
    "-movflags", "+faststart",
    segmentPattern,
  ];
  const ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: ["pipe", "ignore", "pipe"] });
  ffmpeg.stderr.on("data", (d) => emit({ type: "ffmpeg", line: d.toString() }));

  // 2. Launch Playwright and stream JPEG screencast into ffmpeg.stdin.
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: job.viewport });
  const page = await ctx.newPage();
  emit({ type: "navigate", url: job.url });
  await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});

  const session = await ctx.newCDPSession(page);
  await session.send("Page.startScreencast", {
    format: "jpeg",
    quality: 80,
    everyNthFrame: 1,
    maxWidth: job.viewport.width,
    maxHeight: job.viewport.height,
  });

  session.on("Page.screencastFrame", async (frame) => {
    try {
      const buf = Buffer.from(frame.data, "base64");
      ffmpeg.stdin.write(buf);
    } catch { /* pipe may be closed */ }
    try { await session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }); }
    catch { /* noop */ }
  });

  // Heartbeat: report elapsed + segments-on-disk.
  const heartbeat = setInterval(async () => {
    const elapsed = Math.round((Date.now() - job.startedAt) / 1000);
    const files = (await readdir(job.workDir).catch(() => []))
      .filter((f) => /^segment-\d{3}\.mp4$/.test(f))
      .sort();
    job.segments = files;
    emit({ type: "progress", elapsedSec: elapsed, segments: files });
    if (job.totalSeconds > 0 && elapsed >= job.totalSeconds) job.stopRequested = true;
  }, 1000);

  // Wait until stop is requested or page closes.
  await new Promise((resolve) => {
    const tick = setInterval(() => {
      if (job.stopRequested) { clearInterval(tick); resolve(undefined); }
    }, 250);
    page.on("close", () => { clearInterval(tick); resolve(undefined); });
  });

  clearInterval(heartbeat);
  try { await session.send("Page.stopScreencast"); } catch { /* noop */ }
  try { await browser.close(); } catch { /* noop */ }
  try { ffmpeg.stdin.end(); } catch { /* noop */ }
  await new Promise((res) => ffmpeg.on("exit", res));

  // 3. Merge segments → final.mp4
  job.status = "merging";
  emit({ type: "status", status: job.status });
  const files = (await readdir(job.workDir))
    .filter((f) => /^segment-\d{3}\.mp4$/.test(f))
    .sort();
  job.segments = files;

  if (files.length === 0) {
    job.status = "failed";
    job.error = "no segments were produced";
    emit({ type: "error", message: job.error });
    return;
  }

  const listPath = path.join(job.workDir, "_concat.txt");
  await writeFile(listPath, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  const finalPath = path.join(job.workDir, "final.mp4");
  await new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listPath, "-c", "copy", finalPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    p.stderr.on("data", (d) => emit({ type: "ffmpeg", line: d.toString() }));
    p.on("exit", (code) => code === 0 ? resolve(undefined) : reject(new Error(`concat exit ${code}`)));
  });
  job.finalPath = finalPath;

  // 4. video-info.txt
  const infoPath = path.join(job.workDir, "video-info.txt");
  const finishedAt = new Date();
  const lines = [
    `Hn-MAKER recording`,
    `--------------------`,
    `الموقع: ${job.siteName}`,
    `الرابط: ${job.url}`,
    `بدأ: ${new Date(job.startedAt).toLocaleString()}`,
    `انتهى: ${finishedAt.toLocaleString()}`,
    `المدة: ${Math.round((finishedAt.getTime() - job.startedAt) / 1000)} ثانية`,
    `عدد الأجزاء: ${files.length}`,
    `مدة الجزء: ${job.secondsPerSegment} ثانية`,
    `الدقة: ${job.viewport.width}x${job.viewport.height}`,
    ``,
    `الملفات:`,
    ...files.map((f, i) => `  ${i + 1}. ${f}`),
    `  final: final.mp4`,
  ].join("\n");
  await writeFile(infoPath, lines, "utf8");
  job.infoPath = infoPath;

  job.status = "done";
  job.finishedAt = finishedAt.getTime();
  emit({ type: "done", finalPath, infoPath, segments: files });
  // Touch a sentinel so editors detect new files reliably.
  try { createWriteStream(path.join(job.workDir, ".hn-done"), { flags: "w" }).end(); } catch { /* noop */ }
}
