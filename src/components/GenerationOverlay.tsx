import { useEffect, useState } from "react";
import { Loader2, Globe, Sparkles, Mic, Film, CheckCircle2 } from "lucide-react";

const STEPS = [
  { icon: Globe, label: "الاتصال بالموقع وتحميل الصفحات" },
  { icon: Sparkles, label: "تحليل العناصر والتقاط لقطات" },
  { icon: Mic, label: "صياغة نص الشرح بالذكاء الاصطناعي" },
  { icon: Film, label: "تجهيز المشاهد والمؤشر" },
];

export function GenerationOverlay({ open, stage }: { open: boolean; stage: string }) {
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) { setStep(0); setElapsed(0); return; }
    const t1 = setInterval(() => setStep((s) => (s < STEPS.length - 1 ? s + 1 : s)), 2200);
    const t2 = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-md animate-rise"
      dir="rtl"
    >
      <div className="relative neon-card w-[min(92vw,520px)] rounded-2xl p-6 sm:p-8 text-center space-y-5">
        {/* Spinning conic ring */}
        <div className="relative mx-auto h-24 w-24">
          <div
            className="absolute inset-0 rounded-full animate-spin"
            style={{
              background:
                "conic-gradient(from 0deg, oklch(0.72 0.32 350), oklch(0.85 0.22 195), oklch(0.68 0.28 295), oklch(0.72 0.32 350))",
              filter: "blur(2px)",
              animationDuration: "2.4s",
            }}
          />
          <div className="absolute inset-1.5 rounded-full bg-background grid place-items-center">
            <Loader2 className="h-8 w-8 text-brand animate-spin" />
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-bold neon-text">جارٍ إنشاء الفيديو</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">{stage || "تجهيز…"}</p>
        </div>

        <ol className="text-right space-y-2.5 text-sm">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-lg border p-2.5 transition-all ${
                  active
                    ? "border-brand/60 bg-brand/10 shadow-[0_0_20px_-5px_oklch(0.72_0.32_350/.6)]"
                    : done
                      ? "border-border/40 bg-muted/30 opacity-70"
                      : "border-border/30 opacity-50"
                }`}
              >
                <span className="grid h-8 w-8 place-items-center rounded-md bg-card/60">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <span className="flex-1">{s.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
          <span>قد تستغرق العملية بضع ثوانٍ</span>
          <span dir="ltr">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  );
}
