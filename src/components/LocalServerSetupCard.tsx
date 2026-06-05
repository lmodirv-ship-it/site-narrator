import { useState } from "react";
import { Loader2, ServerOff, Power, Copy, ExternalLink, Download, Apple, AppWindow } from "lucide-react";
import {
  LOCAL_SERVER_URL, isElectronApp, restartLocalServerViaBridge, openExternalLink,
} from "@/lib/local-recorder";

interface Props {
  onRecheck: () => void | Promise<void>;
}

/**
 * Shown when /health is unreachable. Two modes:
 *  - Electron: one-click "إعادة تشغيل الخادم المحلي" via window.hnElectron bridge.
 *  - Hosted web: clear manual instructions + copy command + download links.
 */
export function LocalServerSetupCard({ onRecheck }: Props) {
  const electron = isElectronApp();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const cmd = "cd local-server && npm install && npm start";

  const onRestart = async () => {
    setBusy(true);
    const ok = await restartLocalServerViaBridge();
    // give server a moment then re-check health
    setTimeout(async () => { await onRecheck(); setBusy(false); }, 1500);
    if (!ok) setBusy(false);
  };

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { /* noop */ }
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <ServerOff className="h-4 w-4 mt-0.5 text-amber-300 shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="text-sm font-semibold text-amber-200">
            {electron ? "الخادم المحلي متوقف داخل التطبيق" : "الخادم المحلي غير متاح من المتصفح"}
          </div>
          <div className="text-xs text-amber-200/80">
            لا يمكن إنشاء MP4 حقيقي بدون <code dir="ltr">local-server</code> على
            <code dir="ltr"> {LOCAL_SERVER_URL}</code>.
          </div>
        </div>
      </div>

      {electron ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button" onClick={onRestart} disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-md btn-glow px-3 text-xs font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            إعادة تشغيل الخادم المحلي
          </button>
          <button
            type="button" onClick={() => void onRecheck()}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-xs hover:bg-card"
          >
            إعادة الفحص
          </button>
          <span className="text-[11px] text-muted-foreground">
            إن استمرت المشكلة افتح أدوات المطور (عرض → أدوات المطور) لمراجعة السبب.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-amber-200/90">
            أنت تستخدم النسخة المستضافة على الويب. لإنتاج MP4 محلياً اختر أحد الخيارين:
          </div>

          <div className="rounded-md border border-border bg-card/50 p-2.5 space-y-2">
            <div className="text-[11px] font-semibold text-muted-foreground">الخيار 1 — شغّل الخادم يدوياً</div>
            <div className="flex items-center gap-2">
              <code dir="ltr" className="flex-1 text-[11px] font-mono bg-background/60 rounded px-2 py-1 overflow-x-auto">
                {cmd}
              </code>
              <button
                type="button" onClick={onCopy}
                className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-[11px] hover:bg-card/80"
              >
                <Copy className="h-3 w-3" /> {copied ? "تم النسخ" : "نسخ"}
              </button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              يتطلب Node.js 18+ و FFmpeg على جهازك. بعد التشغيل اضغط «إعادة الفحص».
            </div>
            <button
              type="button" onClick={() => void onRecheck()}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-3 text-xs hover:bg-card/80"
            >
              إعادة الفحص
            </button>
          </div>

          <div className="rounded-md border border-brand/30 bg-brand/5 p-2.5 space-y-2">
            <div className="text-[11px] font-semibold text-brand">الخيار 2 — حمّل تطبيق سطح المكتب</div>
            <div className="text-[11px] text-muted-foreground">
              نسخة Electron تُشغّل الخادم تلقائياً بدون أي إعداد يدوي.
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openExternalLink("https://github.com/")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[11px] hover:bg-card/80">
                <AppWindow className="h-3.5 w-3.5" /> Windows
                <ExternalLink className="h-3 w-3 opacity-60" />
              </button>
              <button type="button" onClick={() => openExternalLink("https://github.com/")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[11px] hover:bg-card/80">
                <Apple className="h-3.5 w-3.5" /> macOS
                <ExternalLink className="h-3 w-3 opacity-60" />
              </button>
              <button type="button" onClick={() => openExternalLink("https://github.com/")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[11px] hover:bg-card/80">
                <Download className="h-3.5 w-3.5" /> Linux
                <ExternalLink className="h-3 w-3 opacity-60" />
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground">
              استبدل روابط التنزيل بصفحة إصداراتك بعد بناء التطبيق.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
