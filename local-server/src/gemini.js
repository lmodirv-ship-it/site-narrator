// Gemini helper for local-server scripts (translation, narration polish, etc.)
//
// Reads GEMINI_API_KEY from local-server/.env. Uses the v1beta REST endpoint
// directly (no SDK) so it works in plain Node with no extra deps.
//
// Usage:
//   import { geminiGenerate, geminiTranslate } from "./gemini.js";
//   const text = await geminiGenerate("Explain how AI works in a few words");
//   const { ar, en, fr } = await geminiTranslate("Hello world", ["ar","en","fr"]);

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

function assertKey() {
  if (!GEMINI_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to local-server/.env (see .env.example).",
    );
  }
}

/**
 * Run a single text-in / text-out generation against Gemini.
 * @param {string} prompt
 * @param {{ system?: string, model?: string, temperature?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function geminiGenerate(prompt, opts = {}) {
  assertKey();
  const model = opts.model || GEMINI_MODEL;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    ...(opts.system
      ? { systemInstruction: { parts: [{ text: opts.system }] } }
      : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
    },
  };

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_KEY,
      },
      body: JSON.stringify(body),
    },
  );

  if (!r.ok) {
    throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const json = await r.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return text.trim();
}

/**
 * Translate a single narration string into the given languages.
 * Returns an object keyed by language code, e.g. { ar, en, fr }.
 * @param {string} text
 * @param {string[]} langs e.g. ["ar","en","fr"]
 */
export async function geminiTranslate(text, langs = ["ar", "en", "fr"]) {
  const names = { ar: "Arabic", en: "English", fr: "French", es: "Spanish", de: "German" };
  const list = langs.map((l) => `${l} (${names[l] || l})`).join(", ");
  const prompt = `Translate the following narration into these languages: ${list}.
Return STRICT JSON only, with one key per language code (no markdown, no commentary).

Narration:
"""${text}"""`;

  const raw = await geminiGenerate(prompt, {
    system:
      "You are a professional translator. Preserve tone and meaning. Output strict JSON only.",
    temperature: 0.2,
  });

  // Strip ```json fences if the model added them.
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini did not return valid JSON: ${raw.slice(0, 200)}`);
  }
}
