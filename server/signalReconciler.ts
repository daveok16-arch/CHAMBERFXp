// Background signal reconciler: periodically scans a fixed asset list and
// reconciles signals server-side. Runs on an interval with overlap guard so
// a slow scan never stacks concurrent passes.
import {
  getSignals,
  replaceSignals,
  pruneOldSignals,
} from "./store";
import {
  reconcileSignals,
  summarizeResult,
} from "./signalEngine";
import { ScanSnapshot, ReconcilerResult, ServerSignal } from "../src/shared/signal";

const ASSETS = [
  "BTCUSD", "ETHUSD", "SOLUSD", "XAUUSD",
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "EURAUD", "GBPAUD", "CADJPY", "CHFJPY",
];

type ScanFn = (symbol: string) => Promise<ScanSnapshot | null>;
export type PublishFn = (signals: ServerSignal[], generated: number, closed: number, expired: number) => void;

export function startSignalReconciler(
  scanFn: ScanFn,
  intervalMs = 30000,
  publish?: PublishFn
): { stop: () => void; lastResult: () => ReconcilerResult | null } {
  let running = false;
  let lastResult: ReconcilerResult | null = null;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function pass() {
    if (running || stopped) return;
    running = true;
    try {
      const results = await Promise.allSettled(ASSETS.map((sym) => scanFn(sym).catch(() => null)));
      const scans: ScanSnapshot[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) scans.push(r.value);
      }

      const prev = await getSignals();
      const outcome = reconcileSignals(prev, scans);
      const next = dedupeKeepNewest(outcome.signals);

      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        await replaceSignals(next);
      }
      await pruneOldSignals(30);

      lastResult = summarizeResult({ ...outcome, signals: next, scanned: scans.length });
      const detail = lastResult;
      if (detail.generated > 0 || detail.expired > 0 || detail.closed > 0) {
        console.log(`[reconciler] scans=${detail.scanned} gen=${detail.generated} exp=${detail.expired} close=${detail.closed} active=${detail.totalActive}`);
      }
      if (publish) publish(next, detail.generated, detail.closed, detail.expired);
    } catch (e) {
      console.error("[reconciler] pass failed:", (e as Error).message || e);
    } finally {
      running = false;
    }
  }

  // Run first pass soon after boot, then on interval.
  const initial = setTimeout(() => void pass(), 3000);
  timer = setInterval(() => void pass(), intervalMs);

  return {
    stop() {
      stopped = true;
      clearTimeout(initial);
      if (timer) clearInterval(timer);
    },
    lastResult: () => lastResult,
  };
}

function dedupeKeepNewest(signals: import("../src/shared/signal").ServerSignal[]): import("../src/shared/signal").ServerSignal[] {
  // Signals should already be deduped by reconcileSignals; this is a safety net
  // by id (keeps the first occurrence, which is the newest given unshift ordering).
  const seen = new Set<string>();
  return signals.filter((s) => {
    if (!s || !s.id || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}