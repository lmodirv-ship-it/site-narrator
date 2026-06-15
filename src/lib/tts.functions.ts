import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


const InputSchema = z.object({
  text: z.string().min(1).max(8000),
  lang: z.string().min(2).max(10).optional(),
  voiceId: z.string().min(2).max(64).optional(),
});

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

// Split text into ≤200-char chunks at word boundaries (Google TTS limit).
function chunkText(text: string, maxLen = 190): string[] {
  const out: string[] = [];
  const sentences = text.split(/(?<=[.!?؟،,])\s+/);
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length <= maxLen) {
      cur = (cur + " " + s).trim();
    } else {
      if (cur) out.push(cur);
      if (s.length <= maxLen) {
        cur = s;
      } else {
        // hard split long sentence by words
        const words = s.split(/\s+/);
        let buf = "";
        for (const w of words) {
          if ((buf + " " + w).trim().length <= maxLen) buf = (buf + " " + w).trim();
          else { if (buf) out.push(buf); buf = w; }
        }
        cur = buf;
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function fetchGoogleTtsChunk(text: string, lang: string): Promise<Uint8Array> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob&ttsspeed=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://translate.google.com/",
    },
  });
  if (!res.ok) throw new Error(`Google TTS chunk failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const lang = (data.lang ?? "ar").slice(0, 5);
    const chunks = chunkText(data.text);
    const buffers: Uint8Array[] = [];
    for (const c of chunks) {
      try {
        buffers.push(await fetchGoogleTtsChunk(c, lang));
      } catch (e) {
        console.error("tts chunk failed", e);
      }
    }
    if (buffers.length === 0) throw new Error("TTS failed for all chunks");
    const total = buffers.reduce((n, b) => n + b.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const b of buffers) { merged.set(b, off); off += b.length; }
    return { mimeType: "audio/mpeg", base64: bytesToBase64(merged) };
  });
