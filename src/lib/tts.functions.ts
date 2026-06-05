import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  text: z.string().min(1).max(8000),
  lang: z.string().min(2).max(10),
});

// Google translate TTS supports ~200 chars per request. Chunk by sentences.
function chunkText(text: string, maxLen = 180): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?؟،,])\s+/)
    .filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length > maxLen) {
      if (cur) chunks.push(cur.trim());
      if (s.length > maxLen) {
        // hard split
        for (let i = 0; i < s.length; i += maxLen) chunks.push(s.slice(i, i + maxLen));
        cur = "";
      } else {
        cur = s;
      }
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

async function fetchTtsChunk(text: string, lang: string): Promise<Uint8Array> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob&ttsspeed=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://translate.google.com/",
    },
  });
  if (!res.ok) throw new Error(`TTS chunk failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as number[],
    );
  }
  return btoa(bin);
}

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const chunks = chunkText(data.text);
    const parts: Uint8Array[] = [];
    for (const c of chunks) {
      try {
        const p = await fetchTtsChunk(c, data.lang);
        parts.push(p);
      } catch (e) {
        console.error("tts chunk error", e);
      }
    }
    if (parts.length === 0) throw new Error("TTS failed for all chunks");
    const merged = concatBytes(parts);
    return {
      mimeType: "audio/mpeg",
      base64: bytesToBase64(merged),
    };
  });
