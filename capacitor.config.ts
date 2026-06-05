import type { CapacitorConfig } from "@capacitor/cli";

// Hn-MAKER — Capacitor (Android APK) configuration
// تطبيق Android يعمل كغلاف للواجهة المستضافة على الويب.
// التسجيل الحقيقي (Playwright + FFmpeg) لا يعمل على Android — يجب توجيه
// التطبيق إلى local-server على شبكة الـ Wi-Fi المحلية إن أردت إنتاج MP4.

const config: CapacitorConfig = {
  appId: "app.lovable.hnmaker",
  appName: "Hn-MAKER",
  webDir: "dist/client",
  server: {
    // الواجهة المنشورة — يضمن أن APK دائماً محدث بدون إعادة بناء
    url: "https://site-narrator.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
