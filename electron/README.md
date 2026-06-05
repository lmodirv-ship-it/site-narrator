# Hn-MAKER Desktop (Electron)

غلاف سطح مكتب لـ Hn-MAKER. يفتح الواجهة المنشورة داخل نافذة، ويُشغّل
`local-server` تلقائياً في الخلفية على المنفذ `5174` لإنتاج MP4 حقيقي
عبر Playwright + FFmpeg.

## التثبيت لأول مرة

```bash
# في جذر المشروع
npm install --save-dev electron @electron/packager

# تثبيت اعتمادات local-server (مهم — يثبّت Playwright + Chromium)
cd local-server && npm install && cd ..
```

## تشغيل تجريبي

```bash
npx electron electron/main.cjs
```

## بناء توزيعات قابلة للتشغيل

### Linux (x64)

```bash
npx @electron/packager . "Hn-MAKER" \
  --platform=linux --arch=x64 \
  --out=electron-release --overwrite \
  --extra-resource=local-server \
  --ignore="^/src" --ignore="^/public" \
  --ignore="^/electron-release" --ignore="^/local-server"
```

### Windows (x64)

```bash
npx @electron/packager . "Hn-MAKER" \
  --platform=win32 --arch=x64 \
  --out=electron-release --overwrite \
  --extra-resource=local-server \
  --ignore="^/src" --ignore="^/public" \
  --ignore="^/electron-release" --ignore="^/local-server"
```

### macOS (Apple Silicon)

```bash
npx @electron/packager . "Hn-MAKER" \
  --platform=darwin --arch=arm64 \
  --out=electron-release --overwrite \
  --extra-resource=local-server \
  --ignore="^/src" --ignore="^/public" \
  --ignore="^/electron-release" --ignore="^/local-server"
```

> `--extra-resource=local-server` ينسخ مجلد الخادم المحلي إلى `resources/`
> داخل التطبيق المعبّأ، ويُشغَّل تلقائياً عند الإقلاع.

## استضافة HTML (الويب)

الواجهة منشورة بالفعل على:

```
https://site-narrator.lovable.app
```

أي استضافة ساكنة (Netlify / Vercel / Cloudflare Pages / GitHub Pages) تصلح
لو أردت نشر نسخة خاصة بك. للتسجيل الحقيقي يحتاج المستخدم لتشغيل
`local-server` على جهازه (`cd local-server && npm start`).

## تخصيص الرابط

عند الحاجة لفتح نسخة أخرى (مثلاً معاينة):

```bash
HN_APP_URL=https://id-preview--<your-id>.lovable.app npx electron electron/main.cjs
```
