import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";

import {
  Sparkles, Globe, Languages, Wand2, Loader2, Film,
  Mic, MousePointer2, AlertCircle, Gauge, Hash, Palette, ArrowRight, Music2, Play, Square,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { RecorderStudio } from "@/components/RecorderStudio";
import { Particles } from "@/components/Particles";
import { GenerationOverlay } from "@/components/GenerationOverlay";

import { generateTutorial, type GenerateResult } from "@/lib/tutorial.functions";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { MY_LOVABLE_PROJECTS } from "@/lib/my-projects";
import { VOICE_PRESETS } from "@/lib/voices";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hn-MAKER — فيديو شرح حقيقي لأي موقع" },
      { name: "description", content: "تسجيل شاشة حقيقي لأي موقع مع مؤشر متحرك وصوت شرح — MP4 جاهز للتحميل." },
    ],
  }),
  component: Index,
});

type Level = "quick" | "medium" | "full";
type Quality = "720" | "1080" | "1440";
type Effect = "none" | "zoom" | "fade";

function pagesToLevel(n: number): Level {
  if (n <= 10) return "quick";
  if (n <= 30) return "medium";
  return "full";
}

function Index() {
  const generate = useServerFn(generateTutorial);
  const ttsSynth = useServerFn(synthesizeSpeech);
  const [url, setUrl] = usePersistentState("hn:url", "https://lovable.dev");
  const [siteName, setSiteName] = usePersistentState("hn:siteName", "Lovable");
  const [pages, setPages] = usePersistentState<number>("hn:pages", 20);
  const [quality, setQuality] = usePersistentState<Quality>("hn:quality", "1080");
  const [language, setLanguage] = usePersistentState("hn:language", "ar");
  const [voiceId, setVoiceId] = usePersistentState<string>("hn:voiceId", VOICE_PRESETS[0].id);
  const [pitch, setPitch] = usePersistentState<number>("hn:pitch", 0);
  const [speed, setSpeed] = usePersistentState<number>("hn:speed", 1);
  const [effect, setEffect] = usePersistentState<Effect>("hn:effect", "none");
  const [secondsPerPage, setSecondsPerPage] = usePersistentState<number>("hn:spp", 8);
  const voicePreset = VOICE_PRESETS.find((v) => v.id === voiceId) ?? VOICE_PRESETS[0];

  const [stage, setStage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult, clearResult] = usePersistentState<GenerateResult | null>("hn:result", null);
  const [resumeFrom, setResumeFrom, clearResumeFrom] = usePersistentState<number>("hn:resumeFrom", 0);
  const [pendingJob, setPendingJob, clearPendingJob] = usePersistentState<{
    url: string; siteName: string; language: string; pages: number; startedAt: number;
  } | null>("hn:pendingJob", null);
  const [resumedBanner, setResumedBanner] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null);

  const stopPreview = () => {
    try { previewRef.current?.src.stop(); } catch { /* noop */ }
    try { void previewRef.current?.ctx.close(); } catch { /* noop */ }
    previewRef.current = null;
    setPreviewing(false);
  };

  const playPreview = async () => {
    if (previewing) { stopPreview(); return; }
    setPreviewing(true);
    try {
      const samples: Record<string, string> = {
        ar: "مرحبا، هذه عينة صوتية قصيرة لاختبار الصوت المحدد.",
        en: "Hello, this is a short voice sample to preview the selected voice.",
        fr: "Bonjour, ceci est un court échantillon vocal pour prévisualiser la voix.",
        es: "Hola, esta es una muestra corta de voz para previsualizar.",
        de: "Hallo, dies ist eine kurze Sprachprobe zur Vorschau.",
      };
      const langKey = voicePreset.lang.split("-")[0];
      const text = samples[langKey] ?? samples.en;
      const res = await ttsSynth({ data: { text, lang: voicePreset.lang, voiceId: voicePreset.id } });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.detune.value = pitch * 100;
      src.playbackRate.value = speed;
      src.connect(ctx.destination);
      src.onended = () => stopPreview();
      previewRef.current = { ctx, src };
      src.start();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "تعذر تشغيل العينة");
      setPreviewing(false);
    }
  };



  const runGeneration = async (u: string, name: string, lang: string, p: number) => {
    setError(null);
    setResult(null);
    setResumeFrom(0);
    setLoading(true);
    setStage("جارٍ تحليل الموقع والتقاط الصفحات…");
    setPendingJob({ url: u, siteName: name, language: lang, pages: p, startedAt: Date.now() });
    try {
      const r = await generate({ data: { url: u, siteName: name, language: lang, level: pagesToLevel(p) } });
      const limit = p >= 9999 ? r.scenes.length : p;
      const trimmed: GenerateResult = {
        ...r,
        scenes: r.scenes.slice(0, limit),
        totalSeconds: r.scenes.slice(0, limit).reduce((a, s) => a + Math.max(6, s.narration.split(/\s+/).length * 0.42), 0),
      };
      setResult(trimmed);
      setStage("جاهز — اضغط ابدأ التسجيل");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير معروف");
      setStage("");
    } finally {
      setLoading(false);
      clearPendingJob();
    }
    void quality;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runGeneration(url, siteName, language, pages);
  };

  // Auto-resume: if the tab was closed mid-analysis, re-run with saved inputs.
  // If a result is already cached with a non-zero resumeFrom, show a banner.
  useEffect(() => {
    if (pendingJob && !result && !loading) {
      setResumedBanner(true);
      void runGeneration(pendingJob.url, pendingJob.siteName, pendingJob.language, pendingJob.pages);
    } else if (result && resumeFrom > 0) {
      setResumedBanner(true);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetSession = () => {
    clearResult();
    clearResumeFrom();
    clearPendingJob();
    setResult(null);
    setResumeFrom(0);
    setStage("");
    setResumedBanner(false);
  };


  return (
    <div dir="rtl" className="min-h-screen text-foreground">
      <GenerationOverlay open={loading} stage={stage} />
      <Particles />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl animate-float" />
        <div className="absolute top-40 -right-32 h-96 w-96 rounded-full bg-brand-2/20 blur-3xl animate-float" style={{ animationDelay: "1s" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <header className="pt-2 text-center space-y-3 animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] sm:text-xs backdrop-blur animate-pulse-ring">
            <Sparkles className="h-3.5 w-3.5 text-brand animate-flicker" />
            <span className="text-muted-foreground">تسجيل شاشة حقيقي · صوت شرح · MP4</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight">
            <span className="neon-text glitch-text">Hn-MAKER</span>
          </h1>

          <p className="max-w-2xl mx-auto text-xs sm:text-sm text-muted-foreground">
            ضع الرابط، اختر الإعدادات، ثم ابدأ التسجيل — يتنقل النظام داخل الموقع الحقيقي
            ويصنع فيديو شرح بصوت ومؤشر متحرك.
          </p>
        </header>

        {resumedBanner && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm animate-rise shadow-[0_0_24px_-6px_oklch(0.72_0.32_350/.55)]">
            <span>
              تم استئناف جلستك السابقة تلقائياً
              {result && resumeFrom > 0 && ` — سيكمل التشغيل من المشهد ${resumeFrom + 1}`}
            </span>
            <button
              type="button"
              onClick={resetSession}
              className="rounded-md border border-border bg-card/60 px-3 py-1 text-xs hover:bg-card transition"
            >
              بدء جديد
            </button>
          </div>
        )}

        {/* Form — hidden once generation completes */}

        {!result && (
        <Card className="neon-card hover-tilt border-0 shadow-xl animate-rise" style={{ animationDelay: ".15s" }}>

          <CardContent className="p-4 sm:p-6">
            <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3">
              <Field icon={<Sparkles className="h-4 w-4" />} label="اختر من مشاريعي">
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value=""
                  onChange={(e) => {
                    const p = MY_LOVABLE_PROJECTS.find((x) => x.url === e.target.value);
                    if (p) { setUrl(p.url); setSiteName(p.name); }
                  }}
                >
                  <option value="">— مشاريعي على Lovable ({MY_LOVABLE_PROJECTS.length}) —</option>
                  {MY_LOVABLE_PROJECTS.map((p) => (
                    <option key={p.url} value={p.url}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field icon={<Globe className="h-4 w-4" />} label="رابط الموقع">
                <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" className="h-10" placeholder="https://example.com" />
              </Field>
              <Field icon={<Sparkles className="h-4 w-4" />} label="اسم الموقع">
                <Input type="text" required maxLength={100} value={siteName} onChange={(e) => setSiteName(e.target.value)} className="h-10" />
              </Field>
              <Field icon={<Hash className="h-4 w-4" />} label="عدد الصفحات">
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={pages} onChange={(e) => setPages(Number(e.target.value))}>
                  <option value={20}>20 صفحة</option>
                  <option value={50}>50 صفحة</option>
                  <option value={100}>100 صفحة</option>
                  <option value={9999}>الموقع كاملاً</option>
                </select>
              </Field>

              <Field icon={<Gauge className="h-4 w-4" />} label="جودة الفيديو">
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
                  <option value="720">720p</option>
                  <option value="1080">1080p Full HD</option>
                  <option value="1440">1440p 2K</option>
                </select>
              </Field>

              <Field icon={<Languages className="h-4 w-4" />} label="اللغة">
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                </select>
              </Field>

              <Field icon={<Mic className="h-4 w-4" />} label="الصوت (20 خياراً)">
                <div className="flex gap-2">
                  <select className="flex h-10 flex-1 min-w-0 rounded-md border border-input bg-transparent px-3 text-sm" value={voiceId} onChange={(e) => {
                    const v = VOICE_PRESETS.find((x) => x.id === e.target.value);
                    if (v) { setVoiceId(v.id); setPitch(v.pitch); setSpeed(v.speed); setLanguage(v.lang.split("-")[0]); }
                  }}>
                    {VOICE_PRESETS.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={playPreview}
                    title={previewing ? "إيقاف العينة" : "معاينة الصوت"}
                    aria-label={previewing ? "إيقاف العينة" : "معاينة الصوت"}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-brand/40 bg-brand/10 text-brand hover:bg-brand/20 hover:shadow-[0_0_18px_oklch(0.72_0.32_350/.5)] transition"
                  >
                    {previewing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              </Field>


              <Field icon={<Music2 className="h-4 w-4" />} label={`الرنين / Pitch (${pitch > 0 ? "+" : ""}${pitch})`}>
                <input type="range" min={-12} max={12} step={1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className="w-full accent-[oklch(0.68_0.21_295)]" />
              </Field>

              <Field icon={<Gauge className="h-4 w-4" />} label={`سرعة النطق (${speed.toFixed(2)}x)`}>
                <input type="range" min={0.7} max={1.4} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-[oklch(0.68_0.21_295)]" />
              </Field>

              <Field icon={<Palette className="h-4 w-4" />} label="المؤثرات">
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={effect} onChange={(e) => setEffect(e.target.value as Effect)}>
                  <option value="none">بدون</option>
                  <option value="zoom">تكبير ناعم</option>
                  <option value="fade">تلاشي</option>
                </select>
              </Field>

              <Field icon={<MousePointer2 className="h-4 w-4" />} label={`زمن كل صفحة (${secondsPerPage}ث)`}>
                <input type="range" min={5} max={20} value={secondsPerPage} onChange={(e) => setSecondsPerPage(Number(e.target.value))} className="w-full accent-[oklch(0.68_0.21_295)]" />
              </Field>

              <div className="md:col-span-3 flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-full btn-glow px-6 text-sm font-semibold disabled:opacity-60 hover:-translate-y-0.5 hover:brightness-110 transition"
                >
                  <span className="pointer-events-none absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحليل…</>
                  ) : (
                    <><Wand2 className="h-4 w-4 transition-transform group-hover:rotate-12" /> Generate</>
                  )}
                </button>
                {stage && (
                  <span className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                    <span className="relative inline-flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                    </span>
                    {stage}
                  </span>
                )}
              </div>
            </form>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Studio */}
        {result && (
          <Card className="neon-card hover-tilt border-0 shadow-xl animate-rise">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-9 w-9 rounded-lg btn-glow grid place-items-center">
                  <Film className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-sm sm:text-base">استوديو التسجيل</h2>
                  <p className="text-xs text-muted-foreground">
                    {result.scenes.length} صفحة · جودة {quality}p · {voicePreset.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetSession}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs hover:bg-card transition"
                >
                  <ArrowRight className="h-3.5 w-3.5" /> رجوع للإعدادات
                </button>
              </div>
              <RecorderStudio
                scenes={result.scenes}
                language={voicePreset.lang}
                siteName={siteName}
                effect={effect}
                secondsPerPage={secondsPerPage}
                voicePitch={pitch}
                voiceId={voiceId}
                voiceSpeed={speed}
                startFromIndex={resumeFrom}
                onSceneChange={(i) => setResumeFrom(i)}
              />

            </CardContent>
          </Card>
        )}

        <footer className="text-center text-xs text-muted-foreground py-4">
          تسجيل شاشة حقيقي · Google TTS · MP4 (H.264/AAC)
        </footer>
      </div>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs sm:text-sm font-medium">
        <span className="text-brand">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}
