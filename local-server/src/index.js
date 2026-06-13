// Hn-MAKER Local Recorder Server
// Express HTTP API that runs Playwright to record a real browser session and
// uses FFmpeg to chunk the output into segment-XXX.mp4 files (every 30s by
// default), then concatenates them into final.mp4 inside the chosen workDir.
//
// This server is intentionally separate from the TanStack web app. The web UI
// is just the control panel; all real video files are produced here.

import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { runJob } from "./recorder.js";
import { generateScenes } from "./scripts.js";

const PORT = Number(process.env.PORT) || 5174;

// Shared-secret token. Set HN_LOCAL_SECRET in your env, or one will be
// generated on startup and written to ~/.hn-maker-token for the desktop UI.
const TOKEN =
  process.env.HN_LOCAL_SECRET ||
  (() => {
    const t = randomUUID();
    try {
      writeFileSync(path.join(os.homedir(), ".hn-maker-token"), t, { mode: 0o600 });
    } catch { /* ignore */ }
    return t;
  })();

// Restrict allowed work directories to prevent arbitrary filesystem writes.
const ALLOWED_WORK_ROOT = path.resolve(
  process.env.HN_WORK_ROOT || path.join(os.homedir(), "hn-maker-recordings"),
);

const ALLOWED_ORIGINS = (process.env.HN_ALLOWED_ORIGINS ||
  "http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173,app://-,file://"
).split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.use(
  cors({
    origin(origin, cb) {
      // Same-origin/no-Origin requests (Electron, curl) → allow.
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Origin not allowed"), false);
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: "2mb" }));

// Require a shared-secret token on all state-changing routes.
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "OPTIONS") return next();
  const tok = req.headers["x-hn-token"];
  if (typeof tok !== "string" || tok.length !== TOKEN.length) {
    return res.status(403).json({ error: "Forbidden" });
  }
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < TOKEN.length; i++) diff |= TOKEN.charCodeAt(i) ^ tok.charCodeAt(i);
  if (diff !== 0) return res.status(403).json({ error: "Forbidden" });
  next();
});


/** @type {Map<string, import('./recorder.js').Job>} */
const jobs = new Map();
/** @type {Map<string, Set<import('express').Response>>} */
const subscribers = new Map();

function broadcast(jobId, event) {
  const subs = subscribers.get(jobId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch { /* client gone */ }
  }
}

app.get("/health", async (_req, res) => {
  const ffmpegOk = await new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-version"]);
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  res.json({
    ok: true,
    ffmpeg: ffmpegOk,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    jobs: jobs.size,
  });
});

// Generate multi-language scene scripts from a list of pages.
// Body: { pages: [{url,title?,summary?,content?}], siteName?, baseLang?, languages?, targetSec? }
app.post("/scripts/generate", async (req, res) => {
  try {
    const { pages, siteName, baseLang = "en", languages = ["ar", "en", "fr"], targetSec = 12 } = req.body || {};
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: "pages[] is required" });
    }
    if (pages.length > 30) {
      return res.status(400).json({ error: "too many pages (max 30)" });
    }
    const scenes = await generateScenes(pages, { siteName, baseLang, languages, targetSec });
    res.json({ scenes });
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.post("/jobs", async (req, res) => {
  const {
    url,
    workDir,
    secondsPerSegment = 30,
    totalSeconds = 0,
    viewport = { width: 1920, height: 1080 },
    siteName = "site",
    scenes = [],
    languages = ["ar"],
    burnSubtitles = false,
  } = req.body || {};

  if (!url || !workDir) {
    return res.status(400).json({ error: "url and workDir are required" });
  }
  const resolvedWork = path.resolve(workDir);
  if (!resolvedWork.startsWith(ALLOWED_WORK_ROOT + path.sep) && resolvedWork !== ALLOWED_WORK_ROOT) {
    return res.status(400).json({ error: `workDir must be inside ${ALLOWED_WORK_ROOT}` });
  }
  if (!existsSync(resolvedWork)) {
    return res.status(400).json({ error: `workDir does not exist: ${resolvedWork}` });
  }

  const id = randomUUID();
  const job = {
    id,
    url,
    workDir,
    siteName,
    secondsPerSegment,
    totalSeconds,
    viewport,
    scenes,
    languages,
    burnSubtitles,
    status: "starting",
    segments: [],
    startedAt: Date.now(),
    finishedAt: null,
    finalPath: null,
    infoPath: null,
    error: null,
    stopRequested: false,
  };
  jobs.set(id, job);

  runJob(job, (event) => {
    broadcast(id, event);
  }).catch((err) => {
    job.status = "failed";
    job.error = String(err?.message ?? err);
    broadcast(id, { type: "error", message: job.error });
  });

  res.json({ id, status: job.status });
});


app.get("/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

app.post("/jobs/:id/stop", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });
  job.stopRequested = true;
  res.json({ ok: true });
});

app.get("/jobs/:id/events", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    
  });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: "snapshot", job })}\n\n`);
  let set = subscribers.get(job.id);
  if (!set) { set = new Set(); subscribers.set(job.id, set); }
  set.add(res);
  req.on("close", () => { set.delete(res); });
});

app.listen(PORT, () => {
  console.log(`[hn-maker] local recorder server on http://localhost:${PORT}`);
  console.log(`[hn-maker] auth token: ${TOKEN}`);
  console.log(`[hn-maker] allowed work root: ${ALLOWED_WORK_ROOT}`);
  console.log(`[hn-maker] allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
