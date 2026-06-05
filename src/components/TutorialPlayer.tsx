import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Scene } from "@/lib/tutorial.functions";
import { synthesizeSpeech } from "@/lib/tts.functions";

type Resolution = "1080" | "1440" | "2160";

const RES_MAP: Record<Resolution, { w: number; h: number; bitrate: number; label: string }> = {
  "1080": { w: 1920, h: 1080, bitrate: 8_000_000, label: "Full HD" },
  "1440": { w: 2560, h: 1440, bitrate: 16_000_000, label: "2K" },
  "2160": { w: 3840, h: 2160, bitrate: 30_000_000, label: "4K" },
};

interface Props {
  scenes: Scene[];
  language: string;
  siteName: string;
}

function sceneDuration(narrationSec: number): number {
  return Math.max(5, Math.ceil(narrationSec + 0.5));
}

export function TutorialPlayer({ scenes, language, siteName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resolution, setResolution] = useState<Resolution>("1080");
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("tutorial.mp4");
  const stopFlagRef = useRef(false);
  const audioBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const synthesize = useServerFn(synthesizeSpeech);

  // Auto-downgrade 4K for large videos
  const effectiveRes: Resolution =
    resolution === "2160" && scenes.length > 30 ? "1080" : resolution;
  const { w: W, h: H, bitrate } = RES_MAP[effectiveRes];

  // Preload images
  useEffect(() => {
    scenes.forEach((s) => {
      if (imagesRef.current.has(s.screenshot)) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = s.screenshot;
      imagesRef.current.set(s.screenshot, img);
    });
  }, [scenes]);

  const drawFrame = useCallback(
    (sceneIdx: number, progressT: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scene = scenes[sceneIdx];
      if (!scene) return;
      const scaleF = W / 1920;

      ctx.fillStyle = "#0b0b0f";
      ctx.fillRect(0, 0, W, H);

      const chromeH = Math.round(48 * scaleF);
      const img = imagesRef.current.get(scene.screenshot);
      if (img && img.complete && img.naturalWidth > 0) {
        const availW = W;
        const availH = H - chromeH;
        const scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        const dx = (W - drawW) / 2;
        const dy = chromeH + (availH - drawH) / 2;

        // Chrome
        ctx.fillStyle = "#1f1f24";
        ctx.fillRect(0, 0, W, chromeH);
        ["#ff5f56", "#ffbd2e", "#27c93f"].forEach((c, i) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(20 * scaleF + i * 24 * scaleF, chromeH / 2, 8 * scaleF, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = "#2c2c33";
        ctx.fillRect(120 * scaleF, 10 * scaleF, W - 240 * scaleF, chromeH - 20 * scaleF);
        ctx.fillStyle = "#9ad3a8";
        ctx.font = `${14 * scaleF}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText("🔒", 130 * scaleF, chromeH / 2);
        ctx.fillStyle = "#ddd";
        ctx.fillText(scene.pageUrl.slice(0, 100), 155 * scaleF, chromeH / 2);

        ctx.drawImage(img, dx, dy, drawW, drawH);

        // Cursor
        const targets = scene.cursorTargets.length
          ? scene.cursorTargets
          : [{ x: 50, y: 50, label: "" }];
        const segs = targets.length;
        const segP = progressT * segs;
        const segIdx = Math.min(Math.floor(segP), segs - 1);
        const localT = segP - segIdx;
        const from = targets[Math.max(segIdx - 1, 0)];
        const to = targets[segIdx];
        const ease = localT < 0.5 ? 2 * localT * localT : 1 - Math.pow(-2 * localT + 2, 2) / 2;
        const cx = dx + ((from.x + (to.x - from.x) * ease) / 100) * drawW;
        const cy = dy + ((from.y + (to.y - from.y) * ease) / 100) * drawH;

        if (localT > 0.85) {
          const pulse = (localT - 0.85) / 0.15;
          ctx.beginPath();
          ctx.arc(cx, cy, (10 + pulse * 32) * scaleF, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(96, 165, 250, ${1 - pulse})`;
          ctx.lineWidth = 4 * scaleF;
          ctx.stroke();
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scaleF * 1.4, scaleF * 1.4);
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 6;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 22);
        ctx.lineTo(6, 17);
        ctx.lineTo(11, 27);
        ctx.lineTo(14, 25);
        ctx.lineTo(9, 15);
        ctx.lineTo(16, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Subtitle
      const subH = Math.round(140 * scaleF);
      const grad = ctx.createLinearGradient(0, H - subH, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.9)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, H - subH, W, subH);

      ctx.fillStyle = "#fff";
      ctx.font = `${28 * scaleF}px ui-sans-serif, system-ui, sans-serif`;
      const isRtl = language === "ar";
      ctx.direction = isRtl ? "rtl" : "ltr";
      ctx.textAlign = isRtl ? "right" : "left";

      const words = scene.narration.split(" ");
      const maxWidth = W - 80 * scaleF;
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxWidth) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      if (line) lines.push(line);
      const shown = lines.slice(-3);
      shown.forEach((l, i) => {
        const x = isRtl ? W - 40 * scaleF : 40 * scaleF;
        ctx.fillText(l, x, H - subH + 50 * scaleF + i * 36 * scaleF);
      });

      // Badge
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W - 200 * scaleF, chromeH + 16 * scaleF, 180 * scaleF, 36 * scaleF);
      ctx.fillStyle = "#fff";
      ctx.font = `${16 * scaleF}px sans-serif`;
      ctx.fillText(
        `${siteName} ${sceneIdx + 1}/${scenes.length}`,
        W - 190 * scaleF,
        chromeH + 40 * scaleF,
      );
    },
    [scenes, language, siteName, W, H],
  );

  // Initial preview draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scenes.length) return;
    canvas.width = W;
    canvas.height = H;
    const t = setTimeout(() => drawFrame(0, 0), 400);
    return () => clearTimeout(t);
  }, [scenes, drawFrame, W, H]);

  const preloadAudio = useCallback(
    async (audioCtx: AudioContext) => {
      audioBuffersRef.current.clear();
      for (let i = 0; i < scenes.length; i++) {
        if (stopFlagRef.current) return;
        setPhase(`توليد الصوت ${i + 1}/${scenes.length}`);
        setProgress((i / scenes.length) * 50);
        try {
          const res = await synthesize({
            data: { text: scenes[i].narration, lang: language },
          });
          const bin = atob(res.base64);
          const bytes = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          const buf = await audioCtx.decodeAudioData(bytes.buffer);
          audioBuffersRef.current.set(i, buf);
        } catch (e) {
          console.error("tts scene", i, e);
        }
      }
    },
    [scenes, language, synthesize],
  );

  const playScene = useCallback(
    async (idx: number, audioCtx: AudioContext, audioDest: MediaStreamAudioDestinationNode) => {
      const buf = audioBuffersRef.current.get(idx);
      const narrationSec = buf ? buf.duration : Math.max(5, scenes[idx].narration.split(/\s+/).length * 0.4);
      const durationSec = sceneDuration(narrationSec);

      let src: AudioBufferSourceNode | null = null;
      if (buf) {
        src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioDest);
        src.connect(audioCtx.destination); // for live preview
        src.start();
      }

      const start = performance.now();
      await new Promise<void>((resolve) => {
        let raf = 0;
        const tick = () => {
          if (stopFlagRef.current) {
            cancelAnimationFrame(raf);
            resolve();
            return;
          }
          const elapsed = (performance.now() - start) / 1000;
          const p = Math.min(elapsed / durationSec, 1);
          drawFrame(idx, p);
          if (p >= 1) {
            resolve();
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      });
      try { src?.stop(); } catch { /* noop */ }
    },
    [scenes, drawFrame],
  );

  const exportMp4 = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    stopFlagRef.current = false;
    setDownloadUrl(null);
    setPlaying(true);
    setProgress(0);

    try {
      canvas.width = W;
      canvas.height = H;

      const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxCtor();
      await audioCtx.resume();

      // 1) Preload all TTS audio
      await preloadAudio(audioCtx);
      if (stopFlagRef.current) { setPlaying(false); return; }

      // 2) Set up combined stream
      const audioDest = audioCtx.createMediaStreamDestination();
      const videoStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ]);

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: bitrate,
        audioBitsPerSecond: 128_000,
      });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
      rec.start(1000);

      // 3) Play scenes
      setPhase("جارٍ تسجيل الفيديو…");
      for (let i = 0; i < scenes.length; i++) {
        if (stopFlagRef.current) break;
        setCurrentIdx(i);
        setProgress(50 + (i / scenes.length) * 30);
        await playScene(i, audioCtx, audioDest);
      }

      rec.stop();
      await stopped;
      audioCtx.close();

      const webmBlob = new Blob(chunks, { type: "video/webm" });

      // 4) Convert to MP4 via ffmpeg.wasm
      setPhase("تحويل إلى MP4… (قد يستغرق دقائق)");
      setProgress(85);
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
        const ffmpeg = new FFmpeg();
        const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        });
        ffmpeg.on("progress", ({ progress: p }) => {
          setProgress(85 + Math.min(p, 1) * 14);
        });
        await ffmpeg.writeFile("in.webm", await fetchFile(webmBlob));
        await ffmpeg.exec([
          "-i", "in.webm",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
          "-c:a", "aac", "-b:a", "192k",
          "-movflags", "+faststart",
          "out.mp4",
        ]);
        const out = await ffmpeg.readFile("out.mp4");
        const mp4Blob = new Blob([out as Uint8Array], { type: "video/mp4" });
        const url = URL.createObjectURL(mp4Blob);
        setDownloadUrl(url);
        setDownloadName(`${siteName}-tutorial.mp4`);
        setPhase("جاهز ✓ — حمّل الفيديو MP4");
        setProgress(100);
      } catch (e) {
        console.error("ffmpeg conversion failed, falling back to webm", e);
        const url = URL.createObjectURL(webmBlob);
        setDownloadUrl(url);
        setDownloadName(`${siteName}-tutorial.webm`);
        setPhase("تعذّر التحويل لـ MP4 — تم توفير WebM بدلاً");
        setProgress(100);
      }
    } catch (e) {
      console.error(e);
      setPhase("خطأ: " + (e instanceof Error ? e.message : "غير معروف"));
    } finally {
      setPlaying(false);
    }
  }, [W, H, bitrate, preloadAudio, scenes, playScene, siteName]);

  const stop = useCallback(() => {
    stopFlagRef.current = true;
    setPlaying(false);
    setPhase("");
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm font-medium">الجودة:</label>
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          value={resolution}
          onChange={(e) => setResolution(e.target.value as Resolution)}
          disabled={playing}
        >
          <option value="1080">1080p (Full HD)</option>
          <option value="1440">1440p (2K)</option>
          <option value="2160">2160p (4K)</option>
        </select>
        {effectiveRes !== resolution && (
          <span className="text-xs text-yellow-600">
            تم تخفيض الجودة تلقائياً إلى {RES_MAP[effectiveRes].label} لأن عدد الصفحات &gt; 30
          </span>
        )}
      </div>

      <div className="rounded-lg border bg-black overflow-hidden">
        <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto block" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {!playing ? (
          <Button onClick={exportMp4}>🎬 أنشئ MP4 وحمّله</Button>
        ) : (
          <Button variant="destructive" onClick={stop}>■ إيقاف</Button>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={downloadName}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            ⬇ تحميل {downloadName}
          </a>
        )}
        <span className="text-xs text-muted-foreground">
          المشهد {currentIdx + 1} / {scenes.length}
        </span>
      </div>

      {(playing || progress > 0) && (
        <div className="space-y-1">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">{phase}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        مراحل الإنتاج: توليد الصوت (Google TTS مجاناً) → تسجيل الكانفس مع الصوت
        المدمج → تحويل WebM إلى MP4 بـ H.264/AAC داخل المتصفح عبر ffmpeg.wasm.
        أبقِ هذا التبويب مفتوحاً حتى انتهاء التحويل.
      </p>
    </div>
  );
}
