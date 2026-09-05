// Pluggable durable store for signals.
// Default: atomic JSON file (zero deps, survives restarts on ephemeral FS).
// If DATABASE_URL is set: PostgreSQL (WAL-mode-free, multi-instance safe).
// The interface is identical so the rest of the app is storage-agnostic.
import fs from "fs";
import path from "path";
import { ServerSignal } from "../src/shared/signal";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "signals.json");

let usePg = false;
let pgPool: any = null;

async function initPg() {
  if (!process.env.DATABASE_URL) return;
  try {
    const { Pool } = await import("pg");
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        doc JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    usePg = true;
    console.log("[store] using PostgreSQL");
  } catch (e) {
    console.error("[store] Postgres unavailable, falling back to JSON file:", (e as Error).message);
    usePg = false;
  }
}

// ---- JSON implementation ---------------------------------------------------
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(): ServerSignal[] {
  ensureDir();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
      if (Array.isArray(parsed)) return parsed as ServerSignal[];
    }
  } catch (e) {
    console.error("[store] failed to load signals.json:", e);
  }
  return [];
}

function persistJson(signals: ServerSignal[]) {
  ensureDir();
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(signals, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

// ---- Public interface ------------------------------------------------------
let jsonCache: ServerSignal[] | null = null;

export async function initStore() {
  await initPg();
  if (!usePg) jsonCache = loadJson();
}

export async function getSignals(): Promise<ServerSignal[]> {
  if (usePg) {
    const { rows } = await pgPool.query("SELECT doc FROM signals ORDER BY updated_at DESC");
    return rows.map((r: any) => r.doc as ServerSignal);
  }
  return jsonCache ?? [];
}

export async function getActiveSignals(): Promise<ServerSignal[]> {
  const all = await getSignals();
  return all.filter((s) => s.status === "ACTIVE" || !s.status);
}

export async function replaceSignals(signals: ServerSignal[]): Promise<number> {
  if (usePg) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM signals");
      for (const s of signals) {
        await client.query("INSERT INTO signals (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc", [s.id, JSON.stringify(s)]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return signals.length;
  }
  jsonCache = signals;
  persistJson(signals);
  return signals.length;
}

export async function upsertSignal(signal: ServerSignal): Promise<void> {
  if (usePg) {
    await pgPool.query(
      "INSERT INTO signals (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()",
      [signal.id, JSON.stringify(signal)]
    );
    return;
  }
  const list = jsonCache ?? [];
  const idx = list.findIndex((s) => s.id === signal.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...signal };
  else list.unshift(signal);
  jsonCache = list;
  persistJson(list);
}

export async function clearSignals(): Promise<void> {
  if (usePg) {
    await pgPool.query("DELETE FROM signals");
    return;
  }
  jsonCache = [];
  persistJson([]);
}

export async function pruneOldSignals(maxAgeDays = 30): Promise<number> {
  const all = await getSignals();
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const kept = all.filter((s) => {
    const t = new Date(s.createdAt || s.fireTimestamp || s.timestamp).getTime();
    return !isNaN(t) && t >= cutoff;
  });
  const removed = all.length - kept.length;
  if (removed > 0) await replaceSignals(kept);
  return removed;
}