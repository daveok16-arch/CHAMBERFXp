// Proxies Python-engine calls (predict/train/backtest/worker/db) to the
// engine service. Falls back to the old direct-SQL bridge when the engine
// is not reachable, so the API stays available even if the engine is down.

const ENGINE_BASE = process.env.ENGINE_URL || "http://localhost:8800";

export async function engineFetch(path: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${ENGINE_BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function engineAlive(): Promise<boolean> {
  try {
    const res = await engineFetch("/health", {}, 2500);
    return res.ok;
  } catch {
    return false;
  }
}

export async function engineStatus() {
  try {
    const res = await engineFetch("/status", {}, 3000);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}