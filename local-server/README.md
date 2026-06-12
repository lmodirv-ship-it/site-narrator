# Hn-MAKER — Local Recorder Server (v2)

خادم Node محلي ينتج فيديوهات شرح حقيقية بصوت متعدد اللغات (عربي/إنجليزي/فرنسي) من خطة مشاهد.

## ماذا ينتج هذا الخادم

لكل مهمة، يكتب داخل `workDir` الذي تختاره:

```
workDir/
├─ segment-001.mp4           # أجزاء التسجيل البصري (مؤقتة)
├─ segment-002.mp4
├─ ...
├─ _base.mp4                 # فيديو مدمج بدون صوت (مؤقت)
├─ audio/
│   ├─ s001-ar.mp3 s001-en.mp3 s001-fr.mp3 …
│   └─ track-ar.mp3  track-en.mp3  track-fr.mp3
├─ final-ar.mp4              # MP4 نهائي مع صوت عربي (+ ترجمات إن طُلب حرقها)
├─ final-en.mp4              # نفس البصري بصوت إنجليزي
├─ final-fr.mp4              # نفس البصري بصوت فرنسي
├─ final-ar.srt  final-en.srt  final-fr.srt
├─ script-ar.txt script-en.txt script-fr.txt
└─ video-info.txt
```

كل MP4 يحتوي على:
- **التسجيل الحقيقي** للموقع (Playwright يتنقل بين الصفحات).
- **مؤشر فأرة متحرّك** مرسوم داخل الصفحة (وردي مع نبضة عند الضغط).
- **سرد صوتي ElevenLabs** بنفس الصوت متعدد اللغات.
- **ترجمات SRT** بجانب الفيديو، أو محروقة عليه إذا فعّلت الخيار.

## المتطلبات

- Node.js ≥ 18
- **FFmpeg** + **ffprobe** متاحان في `PATH` (`ffmpeg -version`, `ffprobe -version`).
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: <https://www.gyan.dev/ffmpeg/builds/>
- مفتاح **ElevenLabs** API.

## الإعداد

```bash
cd local-server
cp .env.example .env       # ثم ضع المفتاح بداخله
npm install                # ينزل Chromium لـ Playwright تلقائياً
npm start
```

الخادم يعمل على: **<http://localhost:5174>**

### `.env`

```
ELEVENLABS_API_KEY=sk_xxx_your_key
# اختياري — صوت افتراضي (Sarah multilingual)
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

> أصوات أخرى موصى بها: `EXAVITQu4vr4xnSDxMaL` (Sarah), `JBFqnCBsd6RMkjVDRZzb` (George),
> `XB0fDUnXU5powFXDhCwa` (Charlotte), `pNInz6obpgDQGcFmaJgB` (Adam).
> كل هذه أصوات تدعم العربية والإنجليزية والفرنسية بنموذج `eleven_multilingual_v2`.

## API

| Method | Path | الوصف |
|---|---|---|
| `POST` | `/jobs` | يقبل `{ url, workDir, siteName, viewport, secondsPerSegment, scenes, languages, burnSubtitles }` |
| `GET`  | `/jobs/:id` | حالة المهمة |
| `GET`  | `/jobs/:id/events` | SSE تقدم لحظي |
| `POST` | `/jobs/:id/stop` | إيقاف مبكر |
| `GET`  | `/health` | فحص الخادم + FFmpeg + ElevenLabs |

### مثال جسم `/jobs`

```jsonc
{
  "url": "https://example.com",
  "workDir": "/Users/me/Videos/hn-maker/example",
  "siteName": "Example",
  "viewport": { "width": 1920, "height": 1080 },
  "secondsPerSegment": 30,
  "burnSubtitles": false,
  "languages": ["ar", "en", "fr"],
  "scenes": [
    {
      "url": "https://example.com",
      "narration": {
        "ar": "أهلاً بك في موقع Example. هذه نظرة سريعة على الصفحة الرئيسية.",
        "en": "Welcome to Example. Here is a quick look at the home page.",
        "fr": "Bienvenue sur Example. Voici un aperçu rapide de la page d'accueil."
      },
      "durationSec": 12
    },
    { "url": "https://example.com/pricing", "narration": { "ar": "صفحة الأسعار…", "en": "The pricing page…", "fr": "La page des tarifs…" } }
  ]
}
```
