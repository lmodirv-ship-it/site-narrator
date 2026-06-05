// Thin client for the local recorder server (Playwright + FFmpeg).
// The server runs separately on the user's machine — see `local-server/README.md`.
// This file is browser-safe (uses fetch + EventSource only).

type HnElectronBridge = {
  isElectron: true;
  version?: string;
  localServerUrl?: string;
  restartLocalServer: () => Promise<{ ok: boolean }>;
  openExternal: (url: string) => Promise<{ ok: boolean }>;
};

function getBridge(): HnElectronBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { hnElectron?: HnElectronBridge };
  return w.hnElectron ?? null;
}

export function isElectronApp(): boolean {
  return !!getBridge();
}

export async function restartLocalServerViaBridge(): Promise<boolean> {
  const b = getBridge();
  if (!b) return false;
  try { const r = await b.restartLocalServer(); return !!r?.ok; } catch { return false; }
}

export async function openExternalLink(url: string): Promise<void> {
  const b = getBridge();
  if (b) { await b.openExternal(url); return; }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

export const LOCAL_SERVER_URL =
  (typeof window !== "undefined" && (window as unknown as { __HN_LOCAL_SERVER__?: string }).__HN_LOCAL_SERVER__) ||
  getBridge()?.localServerUrl ||
  "http://localhost:5174";

export type LocalJob = {
  id: string;
  status: "starting" | "recording" | "merging" | "done" | "failed" | "stopped";
  segments: string[];
  finalPath?: string | null;
  infoPath?: string | null;
  error?: string | null;
  startedAt?: number;
  finishedAt?: number | null;
};

export type LocalEvent =
  | { type: "snapshot"; job: LocalJob }
  | { type: "status"; status: LocalJob["status"] }
  | { type: "navigate"; url: string }
  | { type: "progress"; elapsedSec: number; segments: string[] }
  | { type: "ffmpeg"; line: string }
  | { type: "done"; finalPath: string; infoPath: string; segments: string[] }
  | { type: "error"; message: string };

export async function checkLocalServer(): Promise<{ ok: boolean; ffmpeg: boolean } | null> {
  try {
    const res = await fetch(`${LOCAL_SERVER_URL}/health`, { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; ffmpeg: boolean };
  } catch {
    return null;
  }
}

export async function startLocalJob(input: {
  url: string;
  workDir: string;
  siteName?: string;
  secondsPerSegment?: number;
  totalSeconds?: number;
  viewport?: { width: number; height: number };
}): Promise<{ id: string }> {
  const res = await fetch(`${LOCAL_SERVER_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Local server error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function stopLocalJob(id: string): Promise<void> {
  await fetch(`${LOCAL_SERVER_URL}/jobs/${id}/stop`, { method: "POST" });
}

export function subscribeLocalJob(id: string, onEvent: (ev: LocalEvent) => void): () => void {
  const es = new EventSource(`${LOCAL_SERVER_URL}/jobs/${id}/events`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data) as LocalEvent); } catch { /* ignore parse */ }
  };
  return () => es.close();
}
