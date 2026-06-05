import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Play, Square, Download, Loader2, MousePointer2,
  FileVideo, Volume2, AlertCircle, Eye,
  Cpu, Minus, Plus, FolderOpen, FolderCheck,
} from "lucide-react";
import type { Scene } from "@/lib/tutorial.functions";
import { synthesizeSpeech } from "@/lib/tts.functions";


type Effect = "none" | "zoom" | "fade";

interface Props {
  scenes: Scene[];
  language: string;
  siteName: string;
  effect: Effect;
  secondsPerPage: number;
  voicePitch?: number;
  voiceSpeed?: number;
  startFromIndex?: number;
  onSceneChange?: (idx: number) => void;
}

type LogEntry = {
  idx: number;
  pageUrl: string;
  pageTitle: string;
  highlights: string[];
  narration: string;
  status: "pending" | "active" | "done";
};

export function RecorderStudio({
  scenes, language, siteName, effect, secondsPerPage,
  voicePitch = 0, voiceSpeed = 1,
  startFromIndex = 0, onSceneChange,
}: Props) {

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recMimeRef = useRef<string>("video/webm");
  const drawingRef = useRef<boolean>(false);
  const currentSceneRef = useRef<Scene | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopFlagRef = useRef(false);
  const audioBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());

  const [logs, setLogs] = useState<LogEntry[]>(() =>
    scenes.map((s, i) => ({
      idx: i,
      pageUrl: s.pageUrl,
      pageTitle: s.pageTitle,
      highlights: s.cursorTargets.map((t) => t.label).filter(Boolean),
      narration: s.narration,
      status: "pending",
    })),
  );
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("tutorial.mp4");
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  // Real memory controls (Chromium exposes performance.memory)
  const [memBudget, setMemBudget] = useState<number>(512); // MB target
  const [memUsed, setMemUsed] = useState<number>(0);
  const [memLimit, setMemLimit] = useState<number>(0);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [resolution, setResolution] = useState<480 | 720 | 1080 | 1440>(1080);
  const resolutionRef = useRef(resolution);
  useEffect(() => { resolutionRef.current = resolution; }, [resolution]);
  // Encoding settings
  const [codec, setCodec] = useState<"libx264" | "libx265">("libx264");
  const [crf, setCrf] = useState<number>(20);
  const [bitrateK, setBitrateK] = useState<number>(0); // 0 = auto (CRF-driven)
  const codecRef = useRef(codec);
  const crfRef = useRef(crf);
  const bitrateRef = useRef(bitrateK);
  useEffect(() => { codecRef.current = codec; }, [codec]);
  useEffect(() => { crfRef.current = crf; }, [crf]);
  useEffect(() => { bitrateRef.current = bitrateK; }, [bitrateK]);

  const memBudgetRef = useRef(memBudget);

  useEffect(() => { memBudgetRef.current = memBudget; }, [memBudget]);

  useEffect(() => {
    const read = () => {
      const m = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (m) {
        setMemUsed(Math.round(m.usedJSHeapSize / 1048576));
        setMemLimit(Math.round(m.jsHeapSizeLimit / 1048576));
      }
    };
    read();
    const t = setInterval(read, 1500);
    return () => clearInterval(t);
  }, []);

  const pickFolder = useCallback(async () => {
    try {
      const picker = (window as unknown as { showDirectoryPicker?: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      const inIframe = window.self !== window.top;
      if (!picker) {
        setError("متصفحك لا يدعم اختيار مجلد محلي. استخدم Chrome / Edge على الحاسوب.");
        return;
      }
      if (inIframe) {
        const openUrl = window.location.href;
        setError(`اختيار المجلد محظور داخل معاينة Lovable. افتح التطبيق في تبويب مستقل ثم اضغط الزر مرة أخرى: ${openUrl}`);
        try { window.open(openUrl, "_blank", "noopener"); } catch { /* noop */ }
        return;
      }
      const h = await picker({ mode: "readwrite" });
      setDirHandle(h);
      setError(null);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "AbortError") return;
      if (name === "SecurityError") {
        setError("اختيار المجلد محظور هنا (سياسة أمان). افتح التطبيق في تبويب مستقل.");
      } else {
        setError("تعذّر فتح المجلد: " + ((e as Error)?.message ?? "خطأ غير معروف"));
      }
    }
  }, []);

  const saveToFolder = useCallback(async (videoBlob: Blob, name: string) => {
    if (!dirHandle) return;
    try {
      const fh = await dirHandle.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(videoBlob);
      await w.close();
      const infoName = name.replace(/\.[^.]+$/, "") + "-info.txt";
      const info = [
        `العنوان: ${name}`,
        `الموقع: ${siteName}`,
        `اللغة: ${language}`,
        `عدد المشاهد: ${scenes.length}`,
        `تاريخ الإنشاء: ${new Date().toLocaleString()}`,
        ``,
        `— تعريف بالموقع —`,
        scenes[0]?.narration ?? "",
        ``,
        `— المشاهد —`,
        ...scenes.map((s, i) => `${i + 1}. ${s.pageTitle}\n   ${s.pageUrl}\n   ${s.narration}\n`),
      ].join("\n");
      const ih = await dirHandle.getFileHandle(infoName, { create: true });
      const iw = await ih.createWritable();
      await iw.write(new Blob([info], { type: "text/plain;charset=utf-8" }));
      await iw.close();
    } catch (e) {
      console.error("save to folder failed", e);
      setError("تعذّر الحفظ في المجلد المحدد");
    }
  }, [dirHandle, scenes, siteName, language]);



  const synthesize = useServerFn(synthesizeSpeech);

  // Load first page in iframe on mount
  useEffect(() => {
    if (iframeRef.current && scenes[0]) {
      iframeRef.current.src = scenes[0].pageUrl;
    }
  }, [scenes]);

  // Detect iframe blocking (best effort)
  useEffect(() => {
    const t = setTimeout(() => {
      const f = iframeRef.current;
      if (!f) return;
      try {
        // accessing contentDocument throws if cross-origin (still loaded fine)
        void f.contentDocument;
      } catch { /* expected for cross-origin */ }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // Auto-download MP4/WebM as soon as it's ready
  useEffect(() => {
    if (!downloadUrl) return;
    if (dirHandle) return; // already saved to chosen folder

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [downloadUrl, downloadName, dirHandle]);

  const setLogStatus = (idx: number, status: LogEntry["status"]) => {
    setLogs((prev) => prev.map((l) => (l.idx === idx ? { ...l, status } : l)));
  };

  const animateCursor = useCallback(
    async (targets: { x: number; y: number }[], durationMs: number) => {
      const cursor = cursorRef.current;
      const stage = stageRef.current;
      if (!cursor || !stage || targets.length === 0) return;
      const rect = stage.getBoundingClientRect();
      const segs = Math.max(targets.length, 1);
      const perSeg = durationMs / segs;
      const start = performance.now();
      let from = targets[0];
      cursor.style.left = `${(from.x / 100) * rect.width}px`;
      cursor.style.top = `${(from.y / 100) * rect.height}px`;
      for (let i = 0; i < targets.length; i++) {
        const to = targets[i];
        const segStart = performance.now();
        await new Promise<void>((resolve) => {
          const tick = () => {
            if (stopFlagRef.current) return resolve();
            const t = Math.min((performance.now() - segStart) / perSeg, 1);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const cx = from.x + (to.x - from.x) * eased;
            const cy = from.y + (to.y - from.y) * eased;
            cursor.style.left = `${(cx / 100) * rect.width}px`;
            cursor.style.top = `${(cy / 100) * rect.height}px`;
            if (t >= 1) resolve();
            else requestAnimationFrame(tick);
          };
          tick();
        });
        from = to;
      }
      void start;
    },
    [],
  );

  const preloadAudio = useCallback(
    async (audioCtx: AudioContext) => {
      audioBuffersRef.current.clear();
      for (let i = 0; i < scenes.length; i++) {
        if (stopFlagRef.current) return;
        setPhase(`توليد الصوت ${i + 1}/${scenes.length}`);
        setProgress((i / scenes.length) * 30);
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
        // Memory throttle: lower budget → longer pause to allow GC
        const budget = memBudgetRef.current;
        const pauseMs = budget >= 1024 ? 0 : budget >= 512 ? 40 : budget >= 256 ? 150 : 320;
        if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
      }
    },
    [scenes, language, synthesize],
  );


  const startRecording = useCallback(async () => {
    setError(null);
    setDownloadUrl(null);
    setPreparing(true);
    stopFlagRef.current = false;

    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AC();
      await audioCtx.resume();
      audioCtxRef.current = audioCtx;

      // 1) Preload TTS
      await preloadAudio(audioCtx);
      if (stopFlagRef.current) { setPreparing(false); return; }

      // 2) Ask user to share this tab
      setPhase("اختر هذا التبويب لمشاركته (Chrome → This Tab) ثم اضغط مشاركة");
      const targetH = resolutionRef.current;
      const targetW = Math.round((targetH * 16) / 9);
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: targetW }, height: { ideal: targetH } } as MediaTrackConstraints,

        audio: false,
      });

      // 3) Combine display video + TTS audio
      const audioDest = audioCtx.createMediaStreamDestination();
      const combined = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ]);

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const chunks: Blob[] = [];
      // Bitrate scales with memory budget (more RAM → higher quality)
      const bps = memBudgetRef.current >= 1024 ? 12_000_000
        : memBudgetRef.current >= 512 ? 8_000_000
        : memBudgetRef.current >= 256 ? 5_000_000
        : 3_000_000;
      const rec = new MediaRecorder(combined, {
        mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 128_000,
      });

      recorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
      rec.start(1000);

      // If user stops sharing from browser UI
      displayStream.getVideoTracks()[0].addEventListener("ended", () => {
        stopFlagRef.current = true;
        try { rec.state !== "inactive" && rec.stop(); } catch { /* noop */ }
      });

      setPreparing(false);
      setRecording(true);
      setPhase("جارٍ التسجيل…");

      // 4) Walk through scenes
      for (let i = startFromIndex; i < scenes.length; i++) {

        if (stopFlagRef.current) break;
        const scene = scenes[i];
        setCurrentIdx(i); onSceneChange?.(i);
        setLogStatus(i, "active");
        setProgress(30 + (i / scenes.length) * 60);

        // Navigate iframe (skip if same URL as initial first scene)
        if (iframeRef.current && (i > 0 || iframeRef.current.src !== scene.pageUrl)) {
          iframeRef.current.src = scene.pageUrl;
          // wait for load (best-effort, capped)
          await new Promise<void>((resolve) => {
            const f = iframeRef.current!;
            let done = false;
            const onLoad = () => { if (!done) { done = true; resolve(); } };
            f.addEventListener("load", onLoad, { once: true });
            setTimeout(() => { if (!done) { done = true; resolve(); } }, 4500);
          });
        }
        // small settle
        await new Promise((r) => setTimeout(r, 400));

        // Audio
        const buf = audioBuffersRef.current.get(i);
        const narrationSec = buf ? buf.duration : Math.max(secondsPerPage, scene.narration.split(/\s+/).length * 0.38);
        const durationSec = Math.max(secondsPerPage, narrationSec + 0.6);

        let src: AudioBufferSourceNode | null = null;
        if (buf) {
          src = audioCtx.createBufferSource();
          src.buffer = buf;
          try { src.detune.value = voicePitch * 100; } catch { /* unsupported */ }
          src.playbackRate.value = voiceSpeed;
          src.connect(audioDest);
          src.connect(audioCtx.destination);
          src.start();
        }

        // Animate cursor for durationSec
        const targets = scene.cursorTargets.length
          ? scene.cursorTargets
          : [{ x: 50, y: 50, label: "" }];
        await animateCursor(targets, durationSec * 1000);

        try { src?.stop(); } catch { /* noop */ }
        setLogStatus(i, "done");
      }

      setPhase("إنهاء التسجيل…");
      try { rec.state !== "inactive" && rec.stop(); } catch { /* noop */ }
      displayStream.getTracks().forEach((t) => t.stop());
      await stopped;
      audioCtx.close();

      const webmBlob = new Blob(chunks, { type: "video/webm" });

      // 5) Convert to MP4 via ffmpeg.wasm
      setPhase("تحويل إلى MP4… (قد يستغرق دقائق)");
      setProgress(92);
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
          setProgress(92 + Math.min(p, 1) * 7);
        });
        await ffmpeg.writeFile("in.webm", await fetchFile(webmBlob));
        const args = [
          "-i", "in.webm",
          "-vf", `scale=-2:${resolutionRef.current}`,
          "-c:v", codecRef.current, "-preset", "veryfast",
        ];
        if (bitrateRef.current > 0) {
          args.push("-b:v", `${bitrateRef.current}k`, "-maxrate", `${Math.round(bitrateRef.current * 1.5)}k`, "-bufsize", `${bitrateRef.current * 2}k`);
        } else {
          args.push("-crf", String(crfRef.current));
        }
        if (codecRef.current === "libx265") args.push("-tag:v", "hvc1");
        args.push(
          "-c:a", "aac", "-b:a", "192k",
          "-movflags", "+faststart",
          "out.mp4",
        );
        await ffmpeg.exec(args);


        const out = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
        const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
        const mp4Blob = new Blob([ab], { type: "video/mp4" });
        const name = `${siteName}-tutorial.mp4`;
        await saveToFolder(mp4Blob, name);
        setDownloadUrl(URL.createObjectURL(mp4Blob));
        setDownloadName(name);
        setPhase(dirHandle ? `جاهز ✓ — تم الحفظ في المجلد المحدد` : "جاهز ✓");
      } catch (e) {
        console.error("ffmpeg failed", e);
        const name = `${siteName}-tutorial.webm`;
        await saveToFolder(webmBlob, name);
        setDownloadUrl(URL.createObjectURL(webmBlob));
        setDownloadName(name);
        setPhase("تعذّر التحويل لـ MP4 — تم توفير WebM");
      }

      setProgress(100);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "خطأ غير معروف");
      setPhase("");
    } finally {
      setRecording(false);
      setPreparing(false);
    }
    void effect; // reserved for future visual effects
  }, [preloadAudio, scenes, language, siteName, animateCursor, secondsPerPage, effect, voicePitch, voiceSpeed, startFromIndex, onSceneChange, saveToFolder, dirHandle]);
  void startRecording;

  const stop = useCallback(() => {
    stopFlagRef.current = true;
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    setRecording(false);
    setPlaying(false);
    setPhase("تم الإيقاف");
  }, []);

  // Playback without screen-share: navigates iframe, animates cursor, plays TTS audio.
  const startPlayback = useCallback(async () => {
    setError(null);
    setPlaying(true);
    stopFlagRef.current = false;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AC();
      await audioCtx.resume();
      audioCtxRef.current = audioCtx;

      await preloadAudio(audioCtx);
      if (stopFlagRef.current) { setPlaying(false); return; }

      setPhase("جارٍ التشغيل…");
      for (let i = startFromIndex; i < scenes.length; i++) {

        if (stopFlagRef.current) break;
        const scene = scenes[i];
        setCurrentIdx(i); onSceneChange?.(i);
        setLogStatus(i, "active");
        setProgress(30 + (i / scenes.length) * 70);

        if (iframeRef.current && (i > 0 || iframeRef.current.src !== scene.pageUrl)) {
          iframeRef.current.src = scene.pageUrl;
          await new Promise<void>((resolve) => {
            const f = iframeRef.current!;
            let done = false;
            const onLoad = () => { if (!done) { done = true; resolve(); } };
            f.addEventListener("load", onLoad, { once: true });
            setTimeout(() => { if (!done) { done = true; resolve(); } }, 4500);
          });
        }
        await new Promise((r) => setTimeout(r, 300));

        const buf = audioBuffersRef.current.get(i);
        const narrationSec = buf ? buf.duration : Math.max(secondsPerPage, scene.narration.split(/\s+/).length * 0.38);
        const durationSec = Math.max(secondsPerPage, narrationSec + 0.4);

        let src: AudioBufferSourceNode | null = null;
        if (buf) {
          src = audioCtx.createBufferSource();
          src.buffer = buf;
          try { src.detune.value = voicePitch * 100; } catch { /* unsupported */ }
          src.playbackRate.value = voiceSpeed;
          src.connect(audioCtx.destination);
          src.start();
        }
        const targets = scene.cursorTargets.length ? scene.cursorTargets : [{ x: 50, y: 50, label: "" }];
        await animateCursor(targets, durationSec * 1000);
        try { src?.stop(); } catch { /* noop */ }
        setLogStatus(i, "done");
      }
      audioCtx.close();
      setPhase("اكتمل التشغيل ✓");
      setProgress(100);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "خطأ غير معروف");
    } finally {
      setPlaying(false);
    }
  }, [preloadAudio, scenes, animateCursor, secondsPerPage, voicePitch, voiceSpeed, startFromIndex, onSceneChange]);

  // Auto-start playback on mount (no screen-share prompt)
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startPlayback();
    return () => { stopFlagRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-2">
        {playing ? (
          <Button variant="destructive" onClick={stop} className="gap-2">
            <Square className="h-4 w-4" /> إيقاف التشغيل
          </Button>
        ) : !recording && !preparing ? (
          <Button onClick={startPlayback} className="gap-2" variant="secondary">
            <Play className="h-4 w-4" /> إعادة التشغيل
          </Button>
        ) : (
          <Button variant="destructive" onClick={stop} className="gap-2">
            <Square className="h-4 w-4" /> إيقاف
          </Button>
        )}

        {preparing && (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> تجهيز…
          </span>
        )}
        <a
          href={downloadUrl ?? "#"}
          download={downloadName}
          onClick={(e) => { if (!downloadUrl) e.preventDefault(); }}
          aria-disabled={!downloadUrl}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow transition ${
            downloadUrl
              ? "bg-green-600 text-white hover:bg-green-700 animate-pulse"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
          }`}
        >
          <Download className="h-4 w-4" />
          {downloadUrl ? `تحميل الفيديو (${downloadName})` : "تحميل الفيديو (غير جاهز)"}
        </a>
        <span className="text-xs text-muted-foreground ms-auto">
          المشهد {currentIdx + 1} / {scenes.length}
        </span>
      </div>

      {/* Memory budget + Folder picker */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/40 backdrop-blur p-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-brand" />
          <span className="text-xs font-semibold">ذاكرة الحاسوب:</span>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            onClick={() => setMemBudget((v) => Math.max(128, v - 128))}
            title="إنقاص استهلاك الذاكرة (أبطأ)"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="tabular-nums text-sm font-bold text-brand min-w-[64px] text-center" dir="ltr">
            {memBudget} MB
          </span>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            onClick={() => setMemBudget((v) => Math.min(4096, v + 128))}
            title="زيادة استهلاك الذاكرة (أسرع)"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <span className="text-[11px] text-muted-foreground" dir="ltr">
            {memUsed > 0 ? `الفعلي: ${memUsed}${memLimit ? ` / ${memLimit}` : ""} MB` : "غير متاح في هذا المتصفح"}
          </span>
        </div>

        {/* Resolution / quality selector */}
        <div className="flex items-center gap-2">
          <FileVideo className="h-4 w-4 text-brand" />
          <span className="text-xs font-semibold">جودة الفيديو:</span>
          <div className="inline-flex rounded-lg border border-border/60 overflow-hidden">
            {([
              { v: 480, label: "480p", hint: "أصغر ملف" },
              { v: 720, label: "720p", hint: "متوازن" },
              { v: 1080, label: "1080p", hint: "عالي الجودة" },
              { v: 1440, label: "1440p", hint: "أقصى دقة" },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setResolution(opt.v)}
                title={opt.hint}
                className={`px-2.5 py-1 text-xs font-semibold transition ${
                  resolution === opt.v
                    ? "bg-brand text-white"
                    : "bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {resolution >= 1080 ? "أبطأ، حجم أكبر" : resolution <= 480 ? "أسرع، حجم أصغر" : "متوازن"}
          </span>
        </div>

        {/* Codec */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">الترميز:</span>
          <div className="inline-flex rounded-lg border border-border/60 overflow-hidden">
            {([
              { v: "libx264", label: "H.264", hint: "توافق واسع" },
              { v: "libx265", label: "H.265", hint: "حجم أصغر، أبطأ" },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setCodec(opt.v)}
                title={opt.hint}
                className={`px-2.5 py-1 text-xs font-semibold transition ${
                  codec === opt.v ? "bg-brand text-white" : "bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* CRF */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">CRF:</span>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={bitrateK > 0}
            onClick={() => setCrf((v) => Math.min(32, v + 1))} title="جودة أقل / حجم أصغر">
            <Minus className="h-3 w-3" />
          </Button>
          <span className="tabular-nums text-sm font-bold text-brand min-w-[28px] text-center" dir="ltr">
            {bitrateK > 0 ? "—" : crf}
          </span>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={bitrateK > 0}
            onClick={() => setCrf((v) => Math.max(14, v - 1))} title="جودة أعلى / حجم أكبر">
            <Plus className="h-3 w-3" />
          </Button>
          <span className="text-[11px] text-muted-foreground">18=ممتاز · 23=افتراضي · 28=ضاغط</span>
        </div>

        {/* Bitrate override */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Bitrate:</span>
          <Button size="icon" variant="outline" className="h-7 w-7"
            onClick={() => setBitrateK((v) => Math.max(0, v === 0 ? 0 : v - 500))} title="إنقاص">
            <Minus className="h-3 w-3" />
          </Button>
          <span className="tabular-nums text-sm font-bold text-brand min-w-[72px] text-center" dir="ltr">
            {bitrateK > 0 ? `${bitrateK} kbps` : "تلقائي"}
          </span>
          <Button size="icon" variant="outline" className="h-7 w-7"
            onClick={() => setBitrateK((v) => Math.min(20000, v === 0 ? 2000 : v + 500))} title="زيادة">
            <Plus className="h-3 w-3" />
          </Button>
          {bitrateK > 0 && (
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setBitrateK(0)}>
              تلقائي
            </Button>
          )}
        </div>





        <div className="flex items-center gap-2 ms-auto">
          <Button
            size="sm"
            variant={dirHandle ? "secondary" : "outline"}
            onClick={pickFolder}
            className="gap-2"
            title="اختر مجلداً على الحاسوب لحفظ الفيديو وملف المعلومات"
          >
            {dirHandle ? <FolderCheck className="h-4 w-4 text-green-500" /> : <FolderOpen className="h-4 w-4" />}
            {dirHandle ? `محفوظ في: ${dirHandle.name}` : "اختيار مجلد الحفظ على الحاسوب"}
          </Button>
          {dirHandle && (
            <Button size="sm" variant="ghost" onClick={() => setDirHandle(null)} className="text-xs">
              إلغاء
            </Button>
          )}
        </div>
      </div>


      {/* Main: iframe stage 70% + analysis 30% on desktop */}
      <div className="grid gap-4 lg:grid-cols-[70%_30%]">
        {/* Stage */}
        <div
          ref={stageRef}
          className="relative rounded-xl border border-border bg-black overflow-hidden shadow-xl h-[85vh]"
        >
          <iframe
            ref={iframeRef}
            title="site"
            className="absolute inset-0 w-full h-full bg-white"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            referrerPolicy="no-referrer"
            onError={() => setIframeBlocked(true)}
          />
          {/* Cursor overlay */}
          <div
            ref={cursorRef}
            className="pointer-events-none absolute z-10 -translate-x-2 -translate-y-2 transition-none"
            style={{ left: "50%", top: "50%" }}
          >
            <div className="relative">
              <div className="absolute -inset-3 rounded-full bg-yellow-400/40 blur-md animate-pulse" />
              <MousePointer2 className="relative h-8 w-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.9)]" strokeWidth={2.5} fill="currentColor" />
            </div>
          </div>
          {/* Scene badge */}
          <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-2 rounded-lg bg-black/70 px-3 py-2 text-white text-xs backdrop-blur">
            <span className="truncate font-medium">
              {scenes[currentIdx]?.pageTitle ?? ""}
            </span>
            <span className="shrink-0 opacity-70" dir="ltr">
              {currentIdx + 1}/{scenes.length}
            </span>
          </div>
        </div>

        {/* Live analysis panel */}
        <div className="rounded-xl border border-border bg-card/50 backdrop-blur p-3 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
            <Eye className="h-4 w-4 text-brand" /> لوحة التحليل المباشرة
          </div>
          <ol className="space-y-2 text-xs">
            {logs.map((l) => (
              <li
                key={l.idx}
                className={`rounded-lg border p-2.5 transition ${
                  l.status === "active"
                    ? "border-brand bg-brand/10 shadow-lg shadow-brand/20"
                    : l.status === "done"
                    ? "border-border/60 bg-muted/30 opacity-70"
                    : "border-border/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold truncate">{l.idx + 1}. {l.pageTitle}</span>
                  <span className="text-[10px] shrink-0">
                    {l.status === "active" && <Loader2 className="h-3 w-3 animate-spin text-brand" />}
                    {l.status === "done" && <span className="text-green-500">✓</span>}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground truncate" dir="ltr">{l.pageUrl}</div>
                {l.highlights.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.highlights.slice(0, 4).map((h, j) => (
                      <span key={j} className="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px]">
                        {h}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-muted-foreground line-clamp-3 leading-relaxed">
                  <Volume2 className="inline h-3 w-3 me-1 opacity-60" />
                  {l.narration}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {(phase || progress > 0) && (
        <div className="space-y-1">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">{phase}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {iframeBlocked && (
        <p className="text-xs text-yellow-600">
          ملاحظة: قد يرفض بعض المواقع التحميل داخل إطار. جرّب موقعاً آخر إن لم يظهر شيء.
        </p>
      )}

      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
        <FileVideo className="inline h-3.5 w-3.5 me-1" />
        وضع المعاينة: يتنقل النظام تلقائياً بين الصفحات، ويُحرّك المؤشر،
        ويُشغّل صوت الشرح — بدون طلب مشاركة التبويب.
      </div>
    </div>
  );
}
