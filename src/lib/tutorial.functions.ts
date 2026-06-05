import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LevelEnum = z.enum(["quick", "medium", "full"]);

const InputSchema = z.object({
  url: z.string().url(),
  siteName: z.string().min(1).max(100),
  language: z.string().min(2).max(10), // "ar", "en", "fr", ...
  level: LevelEnum,
});

export type Scene = {
  pageUrl: string;
  pageTitle: string;
  screenshot: string; // base64 data URL or remote URL
  narration: string;
  cursorTargets: { x: number; y: number; label: string }[]; // percentages 0-100
};

export type GenerateResult = {
  scenes: Scene[];
  totalSeconds: number;
};

const LEVEL_LIMITS: Record<z.infer<typeof LevelEnum>, number> = {
  quick: 3,
  medium: 5,
  full: 8,
};

async function firecrawlMap(url: string, apiKey: string, limit: number) {
  const res = await fetch("https://api.firecrawl.dev/v2/map", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, limit, includeSubdomains: false }),
  });
  if (!res.ok) {
    throw new Error(`Firecrawl map failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { links?: Array<string | { url: string }> };
  const links = (data.links ?? []).map((l) => (typeof l === "string" ? l : l.url));
  return links;
}

async function firecrawlScrape(url: string, apiKey: string) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "screenshot"],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Firecrawl scrape failed: ${res.status} ${await res.text()}`);
  }
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

async function generateNarration(
  pages: Array<{ url: string; title: string; content: string }>,
  siteName: string,
  language: string,
  lovableKey: string,
): Promise<Array<{ narration: string; cursorTargets: { x: number; y: number; label: string }[] }>> {
  const langName: Record<string, string> = {
    ar: "Arabic",
    en: "English",
    fr: "French",
    es: "Spanish",
    de: "German",
  };
  const targetLang = langName[language] ?? language;

  const sys = `You are an expert tutorial scriptwriter creating a narrated screen-recording walkthrough of a website. Write all narration in ${targetLang}. Keep each scene's narration between 2 and 4 sentences (around 30-60 spoken words). Suggest 2-3 cursor movement targets per scene as percentage coordinates (0-100) over the screenshot, pointing at meaningful UI areas (navigation, hero CTA, main content). Return strictly valid JSON.`;

  const userPrompt = `Website name: ${siteName}\n\nPages (in order):\n${pages
    .map(
      (p, i) =>
        `Page ${i + 1}: ${p.title}\nURL: ${p.url}\nContent excerpt:\n${p.content.slice(0, 1500)}\n---`,
    )
    .join("\n")}`;

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "tutorial_script",
          description: "Returns narration + cursor targets per scene",
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
      },
    ],
    tool_choice: { type: "function", function: { name: "tutorial_script" } },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`AI gateway failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      };
    }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no tool call");
  const parsed = JSON.parse(args) as {
    scenes: Array<{
      narration: string;
      cursorTargets: { x: number; y: number; label: string }[];
    }>;
  };
  return parsed.scenes;
}

export const generateTutorial = createServerFn({ method: "POST" })
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
      urls = await firecrawlMap(data.url, firecrawlKey, maxPages * 3);
    } catch {
      urls = [];
    }
    // Always include the root URL first
    const rootClean = data.url.replace(/\/$/, "");
    const ordered = [rootClean, ...urls.filter((u) => u.replace(/\/$/, "") !== rootClean)];
    const picked = ordered.slice(0, maxPages);

    // 2) Scrape pages (with screenshots) in parallel
    const scraped = await Promise.all(
      picked.map(async (u) => {
        try {
          const r = await firecrawlScrape(u, firecrawlKey);
          return { url: u, ...r };
        } catch (e) {
          console.error("scrape failed", u, e);
          return { url: u, markdown: "", screenshot: "", title: u };
        }
      }),
    );

    const usable = scraped.filter((s) => s.screenshot);
    if (usable.length === 0) {
      throw new Error("Could not capture any page screenshots");
    }

    // 3) Generate narration script
    const scriptScenes = await generateNarration(
      usable.map((p) => ({ url: p.url, title: p.title, content: p.markdown })),
      data.siteName,
      data.language,
      lovableKey,
    );

    // 4) Build scenes
    const scenes: Scene[] = usable.map((p, i) => {
      const script = scriptScenes[i] ?? {
        narration: `${p.title}`,
        cursorTargets: [
          { x: 50, y: 30, label: "header" },
          { x: 50, y: 60, label: "content" },
        ],
      };
      return {
        pageUrl: p.url,
        pageTitle: p.title,
        screenshot: p.screenshot,
        narration: script.narration,
        cursorTargets: script.cursorTargets,
      };
    });

    // Estimate ~150 words/min => ~0.4s/word, min 6s per scene
    const totalSeconds = scenes.reduce((acc, s) => {
      const words = s.narration.split(/\s+/).length;
      return acc + Math.max(6, Math.round(words * 0.4));
    }, 0);

    return { scenes, totalSeconds };
  });
