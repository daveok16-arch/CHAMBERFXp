// Durable signal store: in-memory working set + atomic JSON persistence so
// signals survive process restarts/redeploys (no experimental deps).
import fs from "fs";
import path from "path";
import { ServerSignal } from "../src/shared/signal";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "signals.json");

let cache: ServerSignal[] | null = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): ServerSignal[] {
  if (cache) return cache;
  ensureDir();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) cache = parsed as ServerSignal[];
    }
  } catch (e) {
    // Corrupt file -> start fresh rather than crash the app.
    console.error("[signalStore] failed to load signals.json:", e);
  }
  if (!cache) cache = [];
  return cache;
}

function persist() {
  ensureDir();
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache ?? [], null, 2));
  fs.renameSync(tmp, STORE_FILE); // atomic on same filesystem
}

export function getSignals(): ServerSignal[] {
  return load();
}

export function getActiveSignals(): ServerSignal[] {
  return load().filter((s) => s.status === "ACTIVE" || !s.status);
}

export function replaceSignals(signals: ServerSignal[]): number {
  cache = signals;
  persist();
  return cache.length;
}

export function upsertSignal(signal: ServerSignal): void {
  const list = load();
  const idx = list.findIndex((s) => s.id === signal.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...signal };
  else list.unshift(signal);
  cache = list;
  persist();
}

export function clearSignals(): void {
  cache = [];
  persist();
}

export function pruneOldSignals(maxAgeDays = 30): number {
  const list = load();
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const kept = list.filter((s) => {
    const t = new Date(s.createdAt || s.fireTimestamp || s.timestamp).getTime();
    return !isNaN(t) && t >= cutoff;
  });
  const removed = list.length - kept.length;
  if (removed > 0) {
    cache = kept;
    persist();
  }
  return removed;
}
