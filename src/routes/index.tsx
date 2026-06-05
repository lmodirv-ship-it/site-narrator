import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TutorialPlayer } from "@/components/TutorialPlayer";
import { generateTutorial, type GenerateResult } from "@/lib/tutorial.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HN Website Tutorial Video Maker" },
      {
        name: "description",
        content:
          "أنشئ فيديو شرح لأي موقع مع مؤشر فأرة متحرك وصوت شارح — MVP من HN.",
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
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            HN Website Tutorial Video Maker
          </h1>
          <p className="text-sm text-muted-foreground">
            أداة تنتج فيديو شرح لأي موقع — تحليل تلقائي، مؤشر فأرة متحرك، صوت
            شارح. MVP — المرحلة الأولى.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>إعدادات الفيديو</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">رابط الموقع</label>
                <Input
                  type="url"
                  value={url}
                  required
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">اسم الموقع</label>
                <Input
                  type="text"
                  value={siteName}
                  required
                  maxLength={100}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="مثلاً: مدونتي"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">لغة الفيديو</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">مستوى الشرح</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as Level)}
                >
                  <option value="quick">سريع (حتى 10 صفحات)</option>
                  <option value="medium">متوسط (حتى 30 صفحة)</option>
                  <option value="full">كامل (حتى 120 صفحة)</option>
                </select>
              </div>
              <div className="md:col-span-2 flex items-center gap-3">
                <Button type="submit" disabled={loading}>
                  {loading ? "جارٍ الإنشاء…" : "أنشئ الفيديو"}
                </Button>
                {stage && (
                  <span className="text-sm text-muted-foreground">{stage}</span>
                )}
              </div>
            </form>
            {error && (
              <p className="mt-4 text-sm text-destructive">خطأ: {error}</p>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>
                المعاينة — {result.scenes.length} مشهد (~{result.totalSeconds} ث)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TutorialPlayer
                scenes={result.scenes}
                language={language}
                siteName={siteName}
              />
            </CardContent>
          </Card>
        )}

        <footer className="text-xs text-muted-foreground pt-4">
          الإخراج: MP4 (H.264 + AAC) حتى 4K، مع صوت بشري مدمج عبر Google TTS
          مجاناً. يمكن ربط ElevenLabs لاحقاً للحصول على صوت أكثر طبيعية.
        </footer>
      </div>
    </div>
  );
}
