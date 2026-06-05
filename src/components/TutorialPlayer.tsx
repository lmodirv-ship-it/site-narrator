import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Scene } from "@/lib/tutorial.functions";

interface Props {
  scenes: Scene[];
  language: string;
  siteName: string;
}

// Compute seconds per scene from narration length (≈ speech rate)
function sceneDuration(narration: string): number {
  const words = narration.split(/\s+/).filter(Boolean).length;
  return Math.max(6, Math.round(words * 0.42));
}

export function TutorialPlayer({ scenes, language, siteName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const stopFlagRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Preload images
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

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
    (sceneIdx: number, progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const scene = scenes[sceneIdx];
      if (!scene) return;

      // Background — soft dark
      ctx.fillStyle = "#0b0b0f";
      ctx.fillRect(0, 0, W, H);

      const chromeH = 36;
      const img = imagesRef.current.get(scene.screenshot);
      if (img && img.complete && img.naturalWidth > 0) {
        // Fit image into canvas preserving aspect, with browser chrome bar on top
        const availW = W;
        const availH = H - chromeH;
        const scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        const dx = (W - drawW) / 2;
        const dy = chromeH + (availH - drawH) / 2;

        // Browser chrome bar
        ctx.fillStyle = "#1f1f24";
        ctx.fillRect(0, 0, W, chromeH);
        // Traffic lights
        const colors = ["#ff5f56", "#ffbd2e", "#27c93f"];
        colors.forEach((c, i) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(16 + i * 18, chromeH / 2, 6, 0, Math.PI * 2);
          ctx.fill();
        });
        // URL bar
        ctx.fillStyle = "#2c2c33";
        ctx.fillRect(90, 8, W - 180, chromeH - 16);
        ctx.fillStyle = "#bbb";
        ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(scene.pageUrl.slice(0, 80), 100, chromeH / 2);

        // Screenshot
        ctx.drawImage(img, dx, dy, drawW, drawH);

        // Cursor movement: interpolate between targets
        const targets = scene.cursorTargets.length
          ? scene.cursorTargets
          : [{ x: 50, y: 50, label: "" }];
        const segs = targets.length;
        const segProgress = progress * segs;
        const segIdx = Math.min(Math.floor(segProgress), segs - 1);
        const localT = segProgress - segIdx;
        const from = targets[Math.max(segIdx - 1, 0)];
        const to = targets[segIdx];
        // Ease in-out
        const ease = localT < 0.5 ? 2 * localT * localT : 1 - Math.pow(-2 * localT + 2, 2) / 2;
        const cxPct = from.x + (to.x - from.x) * ease;
        const cyPct = from.y + (to.y - from.y) * ease;
        const cx = dx + (cxPct / 100) * drawW;
        const cy = dy + (cyPct / 100) * drawH;

        // Click pulse when reaching a target (in last 15% of segment)
        if (localT > 0.85) {
          const pulse = (localT - 0.85) / 0.15;
          ctx.beginPath();
          ctx.arc(cx, cy, 8 + pulse * 26, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(96, 165, 250, ${1 - pulse})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Cursor
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#000000";
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
      } else {
        ctx.fillStyle = "#fff";
        ctx.font = "20px sans-serif";
        ctx.fillText("Loading screenshot…", 40, 40);
      }

      // Subtitle / narration
      const subH = 90;
      const grad = ctx.createLinearGradient(0, H - subH, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, H - subH, W, subH);

      ctx.fillStyle = "#fff";
      ctx.font = "18px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "alphabetic";
      const isRtl = language === "ar";
      ctx.direction = isRtl ? "rtl" : "ltr";
      ctx.textAlign = isRtl ? "right" : "left";

      const narration = scene.narration;
      const maxWidth = W - 60;
      const words = narration.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxWidth) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      const shown = lines.slice(-3);
      shown.forEach((l, i) => {
        const x = isRtl ? W - 30 : 30;
        ctx.fillText(l, x, H - 60 + i * 22);
      });

      // Scene number badge
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(W - 130, chromeH + 10, 120, 28);
      ctx.fillStyle = "#fff";
      ctx.font = "13px sans-serif";
      ctx.fillText(`${siteName} ${sceneIdx + 1}/${scenes.length}`, W - 120, chromeH + 28);
    },
    [scenes, language, siteName],
  );

  const speak = useCallback(
    (text: string): Promise<void> =>
      new Promise((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          resolve();
          return;
        }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = language === "ar" ? "ar-SA" : language === "fr" ? "fr-FR" : "en-US";
        u.rate = 1;
        u.pitch = 1;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }),
    [language],
  );

  const playScene = useCallback(
    async (idx: number) => {
      const scene = scenes[idx];
      if (!scene) return;
      const durationSec = sceneDuration(scene.narration);
      const start = performance.now();
      // Start speech in parallel (won't be recorded into the video — preview only)
      const speechPromise = speak(scene.narration);

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
      await speechPromise;
    },
    [scenes, drawFrame, speak],
  );

  const play = useCallback(async () => {
    if (playing) return;
    setPlaying(true);
    stopFlagRef.current = false;
    for (let i = 0; i < scenes.length; i++) {
      if (stopFlagRef.current) break;
      setCurrentIdx(i);
      await playScene(i);
    }
    setPlaying(false);
  }, [playing, scenes.length, playScene]);

  const stop = useCallback(() => {
    stopFlagRef.current = true;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setPlaying(false);
  }, []);

  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloadUrl(null);
    recordedChunksRef.current = [];
    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      setDownloadUrl(URL.createObjectURL(blob));
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
    await play();
    rec.stop();
    setRecording(false);
  }, [play]);

  // Initial draw
  useEffect(() => {
    if (scenes.length > 0) {
      // Wait a tick for image load
      const t = setTimeout(() => drawFrame(0, 0), 300);
      return () => clearTimeout(t);
    }
  }, [scenes, drawFrame]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-auto block"
        />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {!playing ? (
          <Button onClick={play}>▶ تشغيل المعاينة</Button>
        ) : (
          <Button variant="destructive" onClick={stop}>■ إيقاف</Button>
        )}
        <Button
          variant="secondary"
          onClick={startRecording}
          disabled={recording || playing}
        >
          {recording ? "⏺ يسجل…" : "⏺ سجّل وحمّل الفيديو"}
        </Button>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={`${siteName}-tutorial.webm`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            ⬇ حمّل الفيديو (.webm)
          </a>
        )}
        <span className="text-xs text-muted-foreground">
          المشهد {currentIdx + 1} / {scenes.length}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        ملاحظة: في هذه النسخة المؤقتة الصوت يُنطق عبر متصفحك (Web Speech API) أثناء المعاينة فقط
        ولا يُضمَّن داخل ملف الفيديو المسجّل. سيتم في المرحلة الثانية ربط ElevenLabs لإنتاج صوت
        بشري مدمج داخل MP4 نهائي.
      </p>
    </div>
  );
}
