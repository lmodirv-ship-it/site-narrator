// Scene-script generation for local-server.
//
// Given a list of pages (URL + optional title/summary/content), generate a
// natural narration in a base language, then translate it to ar/en/fr (or any
// subset) via Gemini. Returns scenes[] ready to feed into the recorder.

import { geminiGenerate, geminiTranslate } from "./gemini.js";

/**
 * @typedef {Object} PageInput
 * @property {string} url
 * @property {string} [title]
 * @property {string} [summary]
 * @property {string} [content]    // optional raw text/markdown of the page
 */

/**
 * @typedef {Object} Scene
 * @property {string} url
 * @property {Record<string,string>} narration  // { ar, en, fr }
 * @property {number} [durationSec]
 */

const WORDS_PER_SEC = 2.4; // ~145 wpm average TTS pace

function estimateDuration(text) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(6, Math.round(words / WORDS_PER_SEC));
}

/**
 * Build narration for a single page in the base language.
 * @param {PageInput} page
 * @param {{ siteName?: string, baseLang?: string, tone?: string, targetSec?: number }} opts
 */
export async function generateNarrationForPage(page, opts = {}) {
  const baseLang = opts.baseLang || "en";
  const target = opts.targetSec || 12;
  const tone = opts.tone || "warm, clear, professional — like a friendly product tour";
  const langName = { ar: "Arabic", en: "English", fr: "French" }[baseLang] || baseLang;

  const ctx = [
    page.title ? `Title: ${page.title}` : "",
    page.summary ? `Summary: ${page.summary}` : "",
    page.content ? `Page text (truncated):\n${String(page.content).slice(0, 2000)}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `Write a short voice-over narration for this page of ${opts.siteName || "the website"}.

URL: ${page.url}
${ctx || "(no extra context — infer from the URL)"}

Requirements:
- Language: ${langName}
- Tone: ${tone}
- Length: about ${target} seconds when read aloud (~${Math.round(target * WORDS_PER_SEC)} words)
- Speak directly to the viewer; explain WHAT this page shows and WHY it matters
- No markdown, no bullet points, no quotes — just one fluent paragraph
- Do not say "welcome to" on every page; vary the openings`;

  const text = await geminiGenerate(prompt, {
    system: "You are a professional video voice-over writer. Output ONE paragraph of plain text.",
    temperature: 0.7,
  });
  return text.replace(/^["'`]+|["'`]+$/g, "").trim();
}

/**
 * Generate full multi-language scenes for a list of pages.
 * @param {PageInput[]} pages
 * @param {{ siteName?: string, baseLang?: string, languages?: string[], targetSec?: number, onProgress?: (e:{index:number,total:number,url:string,phase:string})=>void }} [opts]
 * @returns {Promise<Scene[]>}
 */
export async function generateScenes(pages, opts = {}) {
  const baseLang = opts.baseLang || "en";
  const languages = opts.languages || ["ar", "en", "fr"];
  const targetSec = opts.targetSec || 12;
  const scenes = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    opts.onProgress?.({ index: i, total: pages.length, url: page.url, phase: "narration" });

    const base = await generateNarrationForPage(page, {
      siteName: opts.siteName,
      baseLang,
      targetSec,
    });

    opts.onProgress?.({ index: i, total: pages.length, url: page.url, phase: "translate" });

    let narration = { [baseLang]: base };
    const others = languages.filter((l) => l !== baseLang);
    if (others.length > 0) {
      const translated = await geminiTranslate(base, others);
      narration = { ...narration, ...translated };
    }

    // Ensure every requested language has a string.
    for (const l of languages) {
      if (!narration[l] || typeof narration[l] !== "string") {
        narration[l] = base; // fallback
      }
    }

    scenes.push({
      url: page.url,
      narration,
      durationSec: estimateDuration(narration[baseLang]),
    });
  }

  return scenes;
}
