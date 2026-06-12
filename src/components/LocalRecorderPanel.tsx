import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Server, Square, FolderInput, CheckCircle2, AlertTriangle, Film, Cpu } from "lucide-react";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  LOCAL_SERVER_URL, checkLocalServer, startLocalJob, stopLocalJob,
  subscribeLocalJob, isElectronApp, type LocalEvent, type LocalJob,
} from "@/lib/local-recorder";
import { LocalServerSetupCard } from "./LocalServerSetupCard";

interface Props {
  url: string;
  siteName: string;
}

/**
 * Control panel for the local Playwright + FFmpeg recorder.
 * The server lives in `local-server/` and runs on http://localhost:5174.
 * This panel: shows server health, lets the user pick a workDir (absolute
 * path string — the browser cannot send a FileSystemHandle to a separate
 * server), starts a job, and streams progress via SSE.
 */
export function LocalRecorderPanel({ url, siteName }: Props) {
  const [workDir, setWorkDir] = usePersistentState<string>("hn:workDir", "");
  const [segSec, setSegSec] = usePersistentState<number>("hn:segSec", 30);
  const [totalSec, setTotalSec] = usePersistentState<number>("hn:totalSec", 0);
  const [health, setHealth] = useState<{ ok: boolean; ffmpeg: boolean } | null | "checking">("checking");
  const [job, setJob] = useState<LocalJob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const refreshHealth = useCallback(async () => {
    setHealth("checking");
    setHealth(await checkLocalServer());
  }, []);

  useEffect(() => { void refreshHealth(); }, [refreshHealth]);
  useEffect(() => () => { unsubRef.current?.(); }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!workDir.trim()) { setError("اكتب مسار مجلد العمل أولاً"); return; }
    setBusy(true);
    try {
      const { id } = await startLocalJob({
        url, workDir: workDir.trim(), siteName,
        secondsPerSegment: segSec, totalSeconds: totalSec,
      });
      setJob({ id, status: "starting", segments: [] });
      unsubRef.current?.();
      unsubRef.current = subscribeLocalJob(id, (ev: LocalEvent) => {
        if (ev.type === "snapshot") setJob(ev.job);
        else if (ev.type === "status") setJob((j) => j ? { ...j, status: ev.status } : j);
        else if (ev.type === "progress") {
          setElapsed(ev.elapsedSec);
          setJob((j) => j ? { ...j, segments: ev.segments } : j);
        } else if (ev.type === "done") {
          setJob((j) => j ? { ...j, status: "done", finalPath: ev.finalPath, infoPath: ev.infoPath, segments: ev.segments } : j);
        } else if (ev.type === "error") {
          setError(ev.message);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [url, siteName, workDir, segSec, totalSec]);

  const stop = useCallback(async () => {
    if (job?.id) await stopLocalJob(job.id);
  }, [job?.id]);

  const canStart = !!workDir.trim() && (health && health !== "checking" && health.ok);
  const running = job && (job.status === "starting" || job.status === "recording" || job.status === "merging");

  const electron = isElectronApp();
  const offline = health !== "checking" && !health?.ok;

  return (
    <div className="rounded-xl border border-brand/40 bg-brand/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-brand/20 grid place-items-center">
          <Server className="h-4 w-4 text-brand" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            إنتاج MP4 حقيقي عبر الخادم المحلي
            {electron && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 text-brand text-[10px] px-2 py-0.5">
                <Cpu className="h-3 w-3" /> Desktop
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            Playwright + FFmpeg · أجزاء كل {segSec}ث · ينتج <code dir="ltr">final.mp4</code> و <code dir="ltr">video-info.txt</code>
          </p>
        </div>
        <HealthBadge health={health} onRefresh={refreshHealth} />
      </div>

      {offline && <LocalServerSetupCard onRecheck={refreshHealth} />}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="flex items-center gap-1.5 font-medium"><FolderInput className="h-3.5 w-3.5" /> مجلد العمل (مسار مطلق على حاسوبك)</span>
          <input
            type="text" dir="ltr" placeholder="/Users/me/Videos/hn-maker"
            value={workDir} onChange={(e) => setWorkDir(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs">
            <span className="font-medium">مدة الجزء (ث)</span>
            <input type="number" min={5} max={300} value={segSec} onChange={(e) => setSegSec(Number(e.target.value) || 30)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium">إجمالي (0 = مفتوح)</span>
            <input type="number" min={0} value={totalSec} onChange={(e) => setTotalSec(Number(e.target.value) || 0)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!running ? (
          <button type="button" onClick={start} disabled={!canStart || busy}
            className="inline-flex h-10 items-center gap-2 rounded-md btn-glow px-4 text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            ابدأ التسجيل الحقيقي
          </button>
        ) : (
          <button type="button" onClick={stop}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-destructive px-4 text-sm font-semibold text-destructive-foreground">
            <Square className="h-4 w-4" /> إيقاف ودمج
          </button>
        )}
        {job && (
          <span className="text-xs text-muted-foreground">
            الحالة: <strong>{statusLabel(job.status)}</strong>
            {running && ` · ${elapsed}ث · ${job.segments.length} جزء`}
          </span>
        )}
      </div>

      {job?.status === "done" && job.finalPath && (
        <div className="rounded-md border border-green-500/40 bg-green-500/10 p-2 text-xs text-green-300 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div>اكتمل! تم حفظ:</div>
            <div dir="ltr" className="font-mono">{job.finalPath}</div>
            {job.infoPath && <div dir="ltr" className="font-mono">{job.infoPath}</div>}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {health !== "checking" && !health?.ok && (
        <div className="text-[11px] text-muted-foreground">
          العنوان المُتوقع: <code dir="ltr">{LOCAL_SERVER_URL}</code>
        </div>
      )}
      {health && health !== "checking" && health.ok && !health.ffmpeg && (
        <div className="text-xs text-amber-300">FFmpeg غير متاح في PATH على هذا الحاسوب. ثبّته ثم أعد المحاولة.</div>
      )}
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case "starting": return "بدء التشغيل…";
    case "tts": return "توليد الصوت (ElevenLabs)…";
    case "recording": return "يسجّل";
    case "merging": return "يدمج الأجزاء";
    case "done": return "اكتمل ✓";
    case "stopped": return "أوقف يدوياً";
    case "failed": return "فشل";
    default:
      if (s.startsWith("mux-")) return `دمج صوت + فيديو (${s.slice(4)})`;
      return s;
  }
}


function HealthBadge({ health, onRefresh }: { health: { ok: boolean; ffmpeg: boolean } | null | "checking"; onRefresh: () => void }) {
  const label =
    health === "checking" ? "جاري الفحص…" :
    !health ? "متوقف" :
    !health.ffmpeg ? "بدون FFmpeg" : "جاهز";
  const color =
    health === "checking" ? "bg-muted text-muted-foreground" :
    !health ? "bg-destructive/20 text-destructive" :
    !health.ffmpeg ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300";
  return (
    <button onClick={onRefresh} className={`text-[11px] px-2 py-1 rounded-md ${color}`} title="إعادة فحص الخادم">
      {label}
    </button>
  );
}
