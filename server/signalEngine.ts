// Server-side signal engine: a faithful port of the client-side reconciliation
// logic so the server becomes the single source of truth for signals.
import { getAssetRRProfile } from "../src/utils/rrFramework";
import { getMarketStatus, calculateMarketAwareAge } from "../src/utils/marketHours";
import {
  ServerSignal,
  ScanSnapshot,
  PairState,
  ReconcilerResult,
} from "../src/shared/signal";

// ---------------------------------------------------------------------------
// Pair state machine (mirrors src/utils/signalEngine.ts)
// ---------------------------------------------------------------------------
const pairStateMap: Record<string, PairState> = {};

export function getPairState(symbol: string): PairState {
  if (!pairStateMap[symbol]) {
    pairStateMap[symbol] = {
      symbol,
      state: "IDLE",
      consecutiveLosses: 0,
      hourlyTimestamps: [],
    };
  }
  const info = pairStateMap[symbol];
  const now = Date.now();

  if (info.lockUntil && info.lockUntil > now) {
    info.state = "LOCKED";
    info.reason = `Auto-locked until ${new Date(info.lockUntil).toLocaleTimeString()} (Spam prevention)`;
    return info;
  } else if (info.lockUntil && info.lockUntil <= now) {
    info.lockUntil = undefined;
  }

  if (info.cooldownUntil && info.cooldownUntil > now) {
    info.state = "COOLDOWN";
    const remMins = Math.ceil((info.cooldownUntil - now) / 60000);
    info.reason = `Cooling down (${remMins}m remaining)`;
    return info;
  } else if (info.cooldownUntil && info.cooldownUntil <= now) {
    info.cooldownUntil = undefined;
  }

  if (info.state !== "ACTIVE") {
    info.state = "IDLE";
    info.reason = undefined;
  }
  return info;
}

export function updatePairOnSignalClosed(symbol: string, result: "HIT TP" | "HIT SL" | "EXPIRED") {
  const info = getPairState(symbol);
  const now = Date.now();
  info.activeSignalId = undefined;

  if (result === "HIT TP") {
    info.consecutiveLosses = 0;
    info.cooldownUntil = now + 3600000;
    info.state = "COOLDOWN";
    info.reason = "Cooling down 1h after WIN";
  } else if (result === "HIT SL") {
    info.consecutiveLosses = (info.consecutiveLosses || 0) + 1;
    info.cooldownUntil = now + 7200000;
    info.state = "COOLDOWN";
    info.reason = `Cooling down 2h after LOSS (${info.consecutiveLosses} consecutive loss)`;
  } else if (result === "EXPIRED") {
    info.consecutiveLosses = 0;
    info.cooldownUntil = now + 300000;
    info.state = "COOLDOWN";
    info.reason = "Cooling down 5min after price drift expired signal";
  }
}

export function canGenerateNewSignal(symbol: string): { allowed: boolean; reason?: string } {
  const info = getPairState(symbol);
  const now = Date.now();

  if (info.state === "ACTIVE") return { allowed: false, reason: "Active signal already exists" };
  if (info.state === "LOCKED") return { allowed: false, reason: info.reason || "Pair is locked" };
  if (info.state === "COOLDOWN") return { allowed: false, reason: info.reason || "Pair in cooldown" };

  const recent = info.hourlyTimestamps.filter((t) => now - t < 3600000);
  info.hourlyTimestamps = recent;
  if (recent.length >= 2) {
    info.lockUntil = now + 14400000;
    info.state = "LOCKED";
    info.reason = "Spam frequency threshold exceeded (>2/hr). Auto-locked 4 hours.";
    return { allowed: false, reason: info.reason };
  }
  return { allowed: true };
}

export function recordSignalGenerated(symbol: string, signalId: string) {
  const info = getPairState(symbol);
  info.state = "ACTIVE";
  info.activeSignalId = signalId;
  info.hourlyTimestamps.push(Date.now());
}

// Test-only: reset the module-level pair state so tests are isolated.
export function __resetPairStateForTests() {
  for (const k of Object.keys(pairStateMap)) delete pairStateMap[k];
}

// ---------------------------------------------------------------------------
// Sanitization + dedup (mirrors client)
// ---------------------------------------------------------------------------
export function calculateSanitizedPipsOrPoints(
  symbol: string,
  entryPrice: number,
  exitPrice: number,
  direction: "BUY" | "SELL"
): { pipsOrPoints: number; pnlPct: number } {
  const isBuy = direction === "BUY";
  const priceDiff = isBuy ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pnlPct = (priceDiff / entryPrice) * 100;

  const isCryptoOrGold = /BTC|XAU|ETH|SOL/.test(symbol);
  const isJpy = symbol.includes("JPY");

  let pipsOrPoints = 0;
  if (isCryptoOrGold) {
    pipsOrPoints = Math.max(-5000, Math.min(5000, priceDiff));
  } else {
    const multiplier = isJpy ? 100 : 10000;
    pipsOrPoints = Math.max(-500, Math.min(500, priceDiff * multiplier));
  }
  return {
    pipsOrPoints: parseFloat(pipsOrPoints.toFixed(1)),
    pnlPct: parseFloat(pnlPct.toFixed(2)),
  };
}

export function deduplicateSignals(signals: ServerSignal[]): ServerSignal[] {
  const seen = new Set<string>();
  const result: ServerSignal[] = [];
  for (const sig of signals) {
    if (!sig || !sig.id) continue;
    const minuteKey = `${sig.symbol}-${sig.direction}-${(sig.fireTimestamp || sig.timestamp || "").substring(0, 16)}`;
    if (seen.has(sig.id) || seen.has(minuteKey)) continue;
    seen.add(sig.id);
    seen.add(minuteKey);
    result.push(sig);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reconciliation (the core: given fresh scans, mutate signal list)
// ---------------------------------------------------------------------------
export function reconcileSignals(
  prev: ServerSignal[],
  scans: ScanSnapshot[]
): { signals: ServerSignal[]; generated: number; expired: number; closed: number } {
  let updated = deduplicateSignals([...prev]);
  let generated = 0;
  let expired = 0;
  let closed = 0;

  for (const item of scans) {
    if (!item.recommendation || item.recommendation === "NEUTRAL" || item.recommendation === "CLOSED") {
      continue;
    }

    const sym = item.symbol;
    const livePrice = item.price;
    const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;

    // 1. Find existing ACTIVE signal
    let existingIdx = updated.findIndex((s) => s.symbol === sym && (s.status === "ACTIVE" || !s.status));

    // 2. Drift / opposite-signal expiry
    if (existingIdx !== -1) {
      const existingSig = updated[existingIdx];
      const priceDrift = Math.abs(livePrice - existingSig.entryPrice);

      let driftThreshold = 0;
      if (["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym)) driftThreshold = livePrice * 0.001;
      else if (baseSym === "XAUUSD") driftThreshold = 5;
      else driftThreshold = baseSym.includes("JPY") ? 0.03 : 0.0003;

      const hasOppositeSignal =
        (existingSig.direction === "BUY" && item.recommendation.includes("SELL")) ||
        (existingSig.direction === "SELL" && item.recommendation.includes("BUY"));

      if (priceDrift > driftThreshold || hasOppositeSignal) {
        const { pipsOrPoints, pnlPct } = calculateSanitizedPipsOrPoints(sym, existingSig.entryPrice, livePrice, existingSig.direction);
        updated[existingIdx] = {
          ...existingSig,
          result: "EXPIRED",
          status: "EXPIRED",
          resolvedAt: new Date().toISOString(),
          pipsOrPoints,
          pnlPct,
        };
        updated.splice(existingIdx, 1);
        expired++;
      }
    }

    // 3. Re-check for active after potential expiry
    const currentIdx = updated.findIndex((s) => s.symbol === sym && (s.status === "ACTIVE" || !s.status));

    if (currentIdx === -1) {
      const check = canGenerateNewSignal(sym);
      if (check.allowed) {
        const isBuy = item.recommendation.includes("BUY");
        const dir: "BUY" | "SELL" = isBuy ? "BUY" : "SELL";
        const entryPrice = livePrice;
        const isCrypto = ["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym);
        const isGold = baseSym === "XAUUSD";

        let atrVal = item.atr;
        if (!atrVal || atrVal <= 0) {
          if (isCrypto) atrVal = livePrice * 0.01;
          else if (isGold) atrVal = 15;
          else if (baseSym.includes("JPY")) atrVal = 0.40;
          else atrVal = 0.0020;
        }

        const rrProfile = getAssetRRProfile(sym);
        const tpMultiplier = rrProfile.tpMultiplier || 2.0;
        const tpOffset = tpMultiplier * atrVal;
        const slOffset = 1.0 * atrVal;

        const tpPrice = isBuy ? entryPrice + tpOffset : entryPrice - tpOffset;
        const slPrice = isBuy ? entryPrice - slOffset : entryPrice + slOffset;

        const now = new Date();
        const utcTime = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";
        const nowIso = now.toISOString();
        const month = nowIso.substring(0, 7);
        const rr = Math.abs(tpPrice - entryPrice) / (Math.abs(entryPrice - slPrice) || 1);
        const sigId = `SIG-${sym.replace("m", "")}-${now.getTime().toString().slice(-5)}`;

        const newSig: ServerSignal = {
          id: sigId,
          timestamp: utcTime,
          createdAt: nowIso,
          updatedAt: nowIso,
          resolvedAt: null,
          resultPips: null,
          month,
          symbol: sym,
          direction: dir,
          entryPrice: parseFloat(entryPrice.toFixed(5)),
          tpPrice: parseFloat(tpPrice.toFixed(5)),
          slPrice: parseFloat(slPrice.toFixed(5)),
          result: "ACTIVE",
          status: "ACTIVE",
          pipsOrPoints: 0,
          pnlPct: 0,
          rrAchieved: parseFloat(rr.toFixed(2)),
          priceAtFire: parseFloat(livePrice.toFixed(5)),
          fireTimestamp: utcTime,
          confidence: item.confidence,
        };

        recordSignalGenerated(sym, sigId);
        updated.unshift(newSig);
        generated++;
      }
    } else {
      // 4. Manage existing ACTIVE signal (TP / trailing / SL / time expiry)
      const currentSig = updated[currentIdx];
      const sigDir = currentSig.direction;
      let newStatus: ServerSignal["status"] = "ACTIVE";
      let exitPrice: number | undefined;

      const tpDistance = Math.abs(currentSig.tpPrice - currentSig.entryPrice);
      const currentDistance = sigDir === "BUY" ? livePrice - currentSig.entryPrice : currentSig.entryPrice - livePrice;
      const progressPct = tpDistance > 0 ? Math.max(0, (currentDistance / tpDistance) * 100) : 0;

      if ((sigDir === "BUY" && livePrice >= currentSig.tpPrice) || (sigDir === "SELL" && livePrice <= currentSig.tpPrice)) {
        newStatus = "HIT TP";
        exitPrice = currentSig.tpPrice;
      } else if (progressPct >= 50) {
        const trailingStop = sigDir === "BUY"
          ? currentSig.entryPrice + tpDistance * 0.5
          : currentSig.entryPrice - tpDistance * 0.5;
        if ((sigDir === "BUY" && livePrice <= trailingStop) || (sigDir === "SELL" && livePrice >= trailingStop)) {
          newStatus = "HIT SL";
          exitPrice = trailingStop;
        }
      } else if ((sigDir === "BUY" && livePrice <= currentSig.slPrice) || (sigDir === "SELL" && livePrice >= currentSig.slPrice)) {
        newStatus = "HIT SL";
        exitPrice = currentSig.slPrice;
      } else {
        const birth = new Date(currentSig.createdAt || currentSig.fireTimestamp || currentSig.timestamp).getTime();
        const marketAge = calculateMarketAwareAge(baseSym, birth, new Date());
        const ageHours = marketAge.activeTradingSeconds / 3600;

        const isStaleByTime = ageHours > 24;
        const isLostMomentum4h = ageHours >= 4 && progressPct < 25;
        const isLostMomentum8h = ageHours >= 8 && progressPct < 40;

        if (isStaleByTime || isLostMomentum4h || isLostMomentum8h) {
          newStatus = "EXPIRED";
          exitPrice = livePrice;
        }
      }

      if (newStatus !== "ACTIVE" && newStatus !== currentSig.status) {
        const { pipsOrPoints, pnlPct } = calculateSanitizedPipsOrPoints(sym, currentSig.entryPrice, exitPrice || livePrice, sigDir);
        const nowIso = new Date().toISOString();

        updated[currentIdx] = {
          ...currentSig,
          status: newStatus,
          result: newStatus as ServerSignal["result"],
          exitPrice,
          pnlPct,
          pipsOrPoints,
          updatedAt: nowIso,
          resolvedAt: nowIso,
          resultPips: pipsOrPoints,
        };

        if (newStatus === "HIT TP" || newStatus === "HIT SL") {
          updatePairOnSignalClosed(sym, newStatus);
        }
        closed++;
      }
    }
  }

  return { signals: updated, generated, expired, closed };
}

export function summarizeResult(r: { generated: number; expired: number; closed: number; signals: ServerSignal[]; scanned: number }): ReconcilerResult {
  return {
    generated: r.generated,
    expired: r.expired,
    closed: r.closed,
    totalActive: r.signals.filter((s) => s.status === "ACTIVE" || !s.status).length,
    scanned: r.scanned,
    ranAt: new Date().toISOString(),
  };
}
