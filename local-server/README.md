# Hn-MAKER — Local Recorder Server

خادم Node محلي يقوم بالتسجيل الحقيقي عبر **Playwright** ويقطع المخرجات إلى أجزاء MP4 كل 30 ثانية عبر **FFmpeg**، ثم يدمجها في `final.mp4` ويكتب `video-info.txt` داخل مجلد العمل الذي تختاره من واجهة Hn-MAKER.

> الواجهة الويب (TanStack) تبقى مجرد لوحة تحكم. كل ملفات الإخراج الحقيقية تُولَّد هنا.

---

## المتطلبات

- Node.js ≥ 18
- **FFmpeg** متاح في `PATH` (تحقق بـ `ffmpeg -version`)
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: <https://www.gyan.dev/ffmpeg/builds/> ثم أضف `bin/` إلى `PATH`

## التثبيت والتشغيل

```bash
cd local-server
npm install     # سيقوم postinstall بتنزيل Chromium لـ Playwright تلقائياً
npm start
```

الخادم يعمل على: **<http://localhost:5174>**

## مسار الإخراج

عند إرسال مهمة من الواجهة، تُكتب الملفات داخل `workDir` (مجلد العمل) الذي تحدده:

```
workDir/
├─ segment-001.mp4
├─ segment-002.mp4
├─ ...
├─ final.mp4
└─ video-info.txt
```

## نقاط الـ API

| Method | Path | الوصف |
|---|---|---|
| `POST` | `/jobs` | إنشاء مهمة تسجيل جديدة. الجسم: `{ url, workDir, secondsPerSegment?, totalSeconds?, viewport? }` |
| `GET`  | `/jobs/:id` | حالة المهمة الحالية (JSON) |
| `GET`  | `/jobs/:id/events` | تيار SSE للتقدم اللحظي |
| `POST` | `/jobs/:id/stop` | إيقاف مبكر مع دمج ما تم التقاطه |
| `GET`  | `/health` | فحص جاهزية الخادم وFFmpeg |

## ملاحظات

- لا يحذف الخادم أي ملف موجود مسبقاً في `workDir` إلا إذا حمل نفس اسم جزء جديد.
- في حال إيقاف الخادم أثناء التسجيل، الأجزاء المكتملة تبقى صالحة ويمكن دمجها يدوياً بـ:

  ```bash
  ffmpeg -f concat -safe 0 -i parts.txt -c copy final.mp4
  ```
