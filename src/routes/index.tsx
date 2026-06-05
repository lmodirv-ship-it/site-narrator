import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Sparkles,
  Globe,
  Languages,
  Layers,
  Wand2,
  Loader2,
  Film,
  Mic,
  MousePointer2,
  Gauge,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { TutorialPlayer } from "@/components/TutorialPlayer";
import { generateTutorial, type GenerateResult } from "@/lib/tutorial.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HN Website Tutorial Video Maker" },
      {
        name: "description",
        content:
          "أنشئ فيديو شرح احترافي لأي موقع مع مؤشر فأرة متحرك وصوت بشري — MP4 حتى 4K.",
      },
    ],
  }),
  component: Index,
});

type Level = "quick" | "medium" | "full";

function Index() {
  const generate = useServerFn(generateTutorial);
  const [url, setUrl] = useState("https://lovable.dev");
  const [siteName, setSiteName] = useState("Lovable");
  const [language, setLanguage] = useState("ar");
  const [level, setLevel] = useState<Level>("quick");
  const [stage, setStage] = useState<string>("");
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
      const r = await generate({ data: { url, siteName, language, level } });
      setStage("جاهز ✓");
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير معروف");
      setStage("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen text-foreground">
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl animate-float" />
        <div className="absolute top-40 -right-32 h-96 w-96 rounded-full bg-brand-2/20 blur-3xl animate-float" style={{ animationDelay: "1s" }} />
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Hero */}
        <header className="pt-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            <span className="text-muted-foreground">مدعوم بـ ElevenLabs + Firecrawl + Gemini</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-brand via-brand-2 to-brand bg-clip-text text-transparent">
              HN Tutorial Video Maker
            </span>
          </h1>
          <p className="max-w-2xl mx-auto text-muted-foreground">
            ضَع رابط أي موقع — نولّد لك فيديو شرح احترافي بصوت بشري ومؤشر فأرة متحرك،
            جاهز للتحميل بصيغة MP4 حتى 4K.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs text-muted-foreground">
            <Badge icon={<Film className="h-3 w-3" />}>MP4 / 4K</Badge>
            <Badge icon={<Mic className="h-3 w-3" />}>صوت بشري</Badge>
            <Badge icon={<MousePointer2 className="h-3 w-3" />}>مؤشر متحرك</Badge>
            <Badge icon={<Gauge className="h-3 w-3" />}>حتى 120 صفحة</Badge>
          </div>
        </header>

        {/* Form card */}
        <Card className="relative overflow-hidden border-border/60 bg-card/70 backdrop-blur-xl shadow-xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent" />
          <CardContent className="p-6">
            <form onSubmit={onSubmit} className="grid gap-5 md:grid-cols-2">
              <Field icon={<Globe className="h-4 w-4" />} label="رابط الموقع">
                <Input
                  type="url"
                  value={url}
                  required
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  dir="ltr"
                  className="h-11"
                />
              </Field>

              <Field icon={<Sparkles className="h-4 w-4" />} label="اسم الموقع">
                <Input
                  type="text"
                  value={siteName}
                  required
                  maxLength={100}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="مثلاً: مدونتي"
                  className="h-11"
                />
              </Field>

              <Field icon={<Languages className="h-4 w-4" />} label="لغة الفيديو">
                <select
                  className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="ar">🇸🇦 العربية</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="fr">🇫🇷 Français</option>
                  <option value="es">🇪🇸 Español</option>
                  <option value="de">🇩🇪 Deutsch</option>
                </select>
              </Field>

              <Field icon={<Layers className="h-4 w-4" />} label="مستوى الشرح">
                <select
                  className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as Level)}
                >
                  <option value="quick">⚡ سريع — حتى 10 صفحات</option>
                  <option value="medium">🎯 متوسط — حتى 30 صفحة</option>
                  <option value="full">🏆 كامل — حتى 120 صفحة</option>
                </select>
              </Field>

              <div className="md:col-span-2 flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full btn-glow px-7 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 transition"
                >
                  {/* shimmer overlay */}
                  <span className="pointer-events-none absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جارٍ الإنشاء…
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 transition-transform group-hover:rotate-12" />
                      أنشئ الفيديو
                    </>
                  )}
                </button>

                {stage && (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
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
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        {result && (
          <Card className="border-border/60 bg-card/70 backdrop-blur-xl shadow-xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg btn-glow grid place-items-center">
                    <Film className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h2 className="font-semibold">المعاينة جاهزة</h2>
                    <p className="text-xs text-muted-foreground">
                      {result.scenes.length} مشهد · ≈ {result.totalSeconds} ثانية
                    </p>
                  </div>
                </div>
              </div>
              <TutorialPlayer
                scenes={result.scenes}
                language={language}
                siteName={siteName}
              />
            </CardContent>
          </Card>
        )}

        <footer className="text-center text-xs text-muted-foreground py-6">
          MP4 (H.264 + AAC) حتى 4K · صوت ElevenLabs مدمج · صُنع بـ ❤️ من HN
        </footer>
      </div>
    </div>
  );
}

function Badge({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 backdrop-blur">
      <span className="text-brand">{icon}</span>
      {children}
    </span>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <span className="text-brand">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}
