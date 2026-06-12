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
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { runJob } from "./recorder.js";

const PORT = Number(process.env.PORT) || 5174;
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

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
    jobs: jobs.size,
  });
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
  if (!existsSync(workDir)) {
    return res.status(400).json({ error: `workDir does not exist: ${workDir}` });
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
    "Access-Control-Allow-Origin": "*",
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
});
