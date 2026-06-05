import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import {
  Sparkles, Globe, Languages, Wand2, Loader2, Film,
  Mic, MousePointer2, AlertCircle, Gauge, Hash, Palette, ArrowRight, Music2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { RecorderStudio } from "@/components/RecorderStudio";
import { generateTutorial, type GenerateResult } from "@/lib/tutorial.functions";
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
  const [url, setUrl] = useState("https://lovable.dev");
  const [siteName, setSiteName] = useState("Lovable");
  const [pages, setPages] = useState<number>(20);
  const [quality, setQuality] = useState<Quality>("1080");
  const [language, setLanguage] = useState("ar");
  const [voiceId, setVoiceId] = useState<string>(VOICE_PRESETS[0].id);
  const [pitch, setPitch] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1);
  const [effect, setEffect] = useState<Effect>("none");
  const [secondsPerPage, setSecondsPerPage] = useState(8);
  const voicePreset = VOICE_PRESETS.find((v) => v.id === voiceId) ?? VOICE_PRESETS[0];

  const [stage, setStage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    setStage("جارٍ تحليل الموقع والتقاط الصفحات…");
    try {
      const r = await generate({
        data: { url, siteName, language, level: pagesToLevel(pages) },
      });
      // trim to user-requested page count
      const limit = pages >= 9999 ? r.scenes.length : pages;
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
    }
    void quality; // forwarded for future use
  };

  return (
    <div dir="rtl" className="min-h-screen text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl animate-float" />
        <div className="absolute top-40 -right-32 h-96 w-96 rounded-full bg-brand-2/20 blur-3xl animate-float" style={{ animationDelay: "1s" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <header className="pt-2 text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] sm:text-xs backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            <span className="text-muted-foreground">تسجيل شاشة حقيقي · صوت شرح · MP4</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-brand via-brand-2 to-brand bg-clip-text text-transparent">
              Hn-MAKER
            </span>
          </h1>
          <p className="max-w-2xl mx-auto text-xs sm:text-sm text-muted-foreground">
            ضع الرابط، اختر الإعدادات، ثم ابدأ التسجيل — يتنقل النظام داخل الموقع الحقيقي
            ويصنع فيديو شرح بصوت ومؤشر متحرك.
          </p>
        </header>

        {/* Form */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-xl shadow-xl">
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
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={voiceId} onChange={(e) => {
                  const v = VOICE_PRESETS.find((x) => x.id === e.target.value);
                  if (v) { setVoiceId(v.id); setPitch(v.pitch); setSpeed(v.speed); setLanguage(v.lang.split("-")[0]); }
                }}>
                  {VOICE_PRESETS.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
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

        {/* Studio */}
        {result && (
          <Card className="border-border/60 bg-card/70 backdrop-blur-xl shadow-xl">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-9 w-9 rounded-lg btn-glow grid place-items-center">
                  <Film className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm sm:text-base">استوديو التسجيل</h2>
                  <p className="text-xs text-muted-foreground">
                    {result.scenes.length} صفحة · جودة {quality}p · لغة {language.toUpperCase()}
                  </p>
                </div>
              </div>
              <RecorderStudio
                scenes={result.scenes}
                language={language}
                siteName={siteName}
                effect={effect}
                secondsPerPage={secondsPerPage}
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
