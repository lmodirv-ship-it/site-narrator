import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LevelEnum = z.enum(["quick", "medium", "full"]);

const InputSchema = z.object({
  url: z.string().url(),
  siteName: z.string().min(1).max(100),
  language: z.string().min(2).max(10),
  level: LevelEnum,
});

export type Scene = {
  pageUrl: string;
  pageTitle: string;
  screenshot: string;
  narration: string;
  cursorTargets: { x: number; y: number; label: string }[];
};

export type GenerateResult = {
  scenes: Scene[];
  totalSeconds: number;
};

const LEVEL_LIMITS: Record<z.infer<typeof LevelEnum>, number> = {
  quick: 10,
  medium: 30,
  full: 120,
};

async function firecrawlMap(url: string, apiKey: string, limit: number) {
  const res = await fetch("https://api.firecrawl.dev/v2/map", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, limit, includeSubdomains: false }),
  });
  if (!res.ok) throw new Error(`Firecrawl map failed: ${res.status}`);
  const data = (await res.json()) as { links?: Array<string | { url: string }> };
  return (data.links ?? []).map((l) => (typeof l === "string" ? l : l.url));
}

async function firecrawlScrape(url: string, apiKey: string) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown", "screenshot"],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl scrape failed: ${res.status}`);
  const json = (await res.json()) as {
    data?: {
      markdown?: string;
      screenshot?: string;
      metadata?: { title?: string; sourceURL?: string };
    };
  };
  return {
    markdown: json.data?.markdown ?? "",
    screenshot: json.data?.screenshot ?? "",
    title: json.data?.metadata?.title ?? url,
  };
}

async function generateNarrationBatch(
  pages: Array<{ url: string; title: string; content: string }>,
  siteName: string,
  language: string,
  lovableKey: string,
  startIndex: number,
): Promise<Array<{ narration: string; cursorTargets: { x: number; y: number; label: string }[] }>> {
  const langName: Record<string, string> = {
    ar: "Arabic", en: "English", fr: "French", es: "Spanish", de: "German",
  };
  const targetLang = langName[language] ?? language;

  const sys = `You are an expert tutorial scriptwriter creating a narrated screen-recording walkthrough of a website. Write all narration in ${targetLang}. Keep each scene's narration between 3 and 5 sentences (around 50-90 spoken words). Suggest 2-4 cursor movement targets per scene as percentage coordinates (0-100) over the screenshot, pointing at meaningful UI areas. Return strictly valid JSON.`;

  const userPrompt = `Website: ${siteName}\nStarting at scene #${startIndex + 1}.\n\nPages:\n${pages
    .map((p, i) => `Scene ${startIndex + i + 1}: ${p.title}\nURL: ${p.url}\nExcerpt:\n${p.content.slice(0, 1200)}\n---`)
    .join("\n")}`;

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userPrompt },
    ],
    tools: [{
      type: "function",
      function: {
        name: "tutorial_script",
        parameters: {
          type: "object",
          properties: {
            scenes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  narration: { type: "string" },
                  cursorTargets: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        x: { type: "number" },
                        y: { type: "number" },
                        label: { type: "string" },
                      },
                      required: ["x", "y", "label"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["narration", "cursorTargets"],
                additionalProperties: false,
              },
            },
          },
          required: ["scenes"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "tutorial_script" } },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI gateway failed: ${res.status}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no tool call");
  const parsed = JSON.parse(args) as {
    scenes: Array<{ narration: string; cursorTargets: { x: number; y: number; label: string }[] }>;
  };
  return parsed.scenes;
}

async function pMapBatched<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export const generateTutorial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<GenerateResult> => {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY missing");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

    const maxPages = LEVEL_LIMITS[data.level];

    // 1) Discover URLs
    let urls: string[] = [];
    try {
      urls = await firecrawlMap(data.url, firecrawlKey, Math.max(maxPages * 2, 20));
    } catch {
      urls = [];
    }
    const rootClean = data.url.replace(/\/$/, "");
    const ordered = [rootClean, ...urls.filter((u) => u.replace(/\/$/, "") !== rootClean)];
    const picked = ordered.slice(0, maxPages);

    // 2) Scrape in batches of 8
    const scraped = await pMapBatched(picked, 8, async (u) => {
      try {
        const r = await firecrawlScrape(u, firecrawlKey);
        return { url: u, ...r };
      } catch (e) {
        console.error("scrape failed", u, e);
        return { url: u, markdown: "", screenshot: "", title: u };
      }
    });

    const usable = scraped.filter((s) => s.screenshot);
    if (usable.length === 0) throw new Error("Could not capture any page screenshots");

    // 3) Generate narration in batches of 10
    const batchSize = 10;
    const scriptScenes: Array<{ narration: string; cursorTargets: { x: number; y: number; label: string }[] }> = [];
    for (let i = 0; i < usable.length; i += batchSize) {
      const batch = usable.slice(i, i + batchSize);
      try {
        const out = await generateNarrationBatch(
          batch.map((p) => ({ url: p.url, title: p.title, content: p.markdown })),
          data.siteName,
          data.language,
          lovableKey,
          i,
        );
        scriptScenes.push(...out);
      } catch (e) {
        console.error("narration batch failed", i, e);
        for (const p of batch) {
          scriptScenes.push({
            narration: `${p.title}`,
            cursorTargets: [
              { x: 50, y: 30, label: "header" },
              { x: 50, y: 60, label: "content" },
            ],
          });
        }
      }
    }

    const scenes: Scene[] = usable.map((p, i) => {
      const script = scriptScenes[i] ?? {
        narration: p.title,
        cursorTargets: [{ x: 50, y: 50, label: "" }],
      };
      return {
        pageUrl: p.url,
        pageTitle: p.title,
        screenshot: p.screenshot,
        narration: script.narration,
        cursorTargets: script.cursorTargets,
      };
    });

    const totalSeconds = scenes.reduce((acc, s) => {
      const words = s.narration.split(/\s+/).length;
      return acc + Math.max(6, Math.round(words * 0.42));
    }, 0);

    return { scenes, totalSeconds };
  });
