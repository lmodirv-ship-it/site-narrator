# Hn-MAKER — Android APK (Capacitor)

تطبيق Android بسيط يعمل كغلاف للواجهة المستضافة. يفتح الموقع داخل WebView،
ويظهر كتطبيق أصلي في قائمة تطبيقات الهاتف.

> ⚠️ ملاحظة مهمة: التسجيل الحقيقي (Playwright + FFmpeg + إنتاج MP4) لا يعمل
> داخل Android. التطبيق على الهاتف هو **واجهة عرض وتحكم فقط**. لإنتاج فيديو
> فعلي يجب تشغيل `local-server` على حاسوب على نفس شبكة Wi-Fi، ثم توجيه
> التطبيق إليه (انظر "وضع التسجيل عبر الشبكة" أدناه).

## المتطلبات

- Node.js ≥ 18
- Android Studio (JDK 17 + Android SDK + Platform Tools)
- متغير بيئة `ANDROID_HOME` معرّف

## تثبيت أولي (مرة واحدة)

```bash
# في جذر المشروع
npm install --save-dev @capacitor/cli
npm install @capacitor/core @capacitor/android

# تهيئة المنصة (يُنشئ مجلد android/)
npx cap add android
```

## البناء والتشغيل

```bash
# 1) بناء واجهة الويب
npm run build

# 2) مزامنة الملفات إلى مشروع Android
npx cap sync android

# 3) فتح المشروع في Android Studio
npx cap open android
```

من Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

ملف APK الناتج:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

## بناء APK من سطر الأوامر

```bash
cd android && ./gradlew assembleDebug
```

ملف APK:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

## وضع التسجيل عبر الشبكة (اختياري)

لإنتاج MP4 حقيقي من الهاتف، شغّل `local-server` على حاسوب على نفس شبكة Wi-Fi:

```bash
cd local-server && npm install && npm start
```

ثم اضبط متغير `__HN_LOCAL_SERVER__` على رابط جهاز الحاسوب من إعدادات
المتصفح/التطبيق (مثلاً `http://192.168.1.10:5174`). الهاتف يصبح لوحة تحكم
عن بُعد والحاسوب يقوم بالتسجيل الفعلي.

## تخصيص

- الأيقونة: استبدل ملفات `android/app/src/main/res/mipmap-*/ic_launcher.png`
- الاسم: عدّل `appName` في `capacitor.config.ts` ثم أعد `npx cap sync`
- الرابط: عدّل `server.url` في `capacitor.config.ts` لاستخدام رابط معاينة آخر
