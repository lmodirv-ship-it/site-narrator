// Translate scene narrations into multiple languages using Lovable AI Gateway.
// Used to produce ar/en/fr tracks from a single source script.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


const InputSchema = z.object({
  scenes: z.array(z.object({
    url: z.string().url(),
    narration: z.string().min(1).max(3000),
  })).min(1).max(200),
  targetLanguages: z.array(z.enum(["ar", "en", "fr"])).min(1).max(3),
  sourceLanguage: z.enum(["ar", "en", "fr"]).default("ar"),
});

const LANG_NAME: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  fr: "French",
};

export const translateNarration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured on the server");

    const out: Array<{ url: string; narration: Record<string, string> }> = data.scenes.map((s) => ({
      url: s.url,
      narration: { [data.sourceLanguage]: s.narration },
    }));

    for (const lang of data.targetLanguages) {
      if (lang === data.sourceLanguage) continue;

      const sys = `You translate short website-tour narrations from ${LANG_NAME[data.sourceLanguage]} into ${LANG_NAME[lang]}. Keep the tone friendly, clear, and concise — suitable for a voice-over. Do not add explanations. Return ONLY a strict JSON array of strings, same length and same order as the input array.`;
      const usr = JSON.stringify(data.scenes.map((s) => s.narration));

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: usr },
          ],
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Translate ${lang} failed: ${r.status} ${t.slice(0, 200)}`);
      }
      const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = j.choices?.[0]?.message?.content ?? "[]";
      const m = text.match(/\[[\s\S]*\]/);
      let arr: string[] = [];
      try { arr = m ? (JSON.parse(m[0]) as string[]) : []; } catch { arr = []; }
      for (let i = 0; i < out.length; i++) {
        out[i].narration[lang] = arr[i] ?? data.scenes[i].narration;
      }
    }

    return { scenes: out };
  });
