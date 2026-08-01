import { AuditedSignalItem } from "../types";
import { getAssetRRProfile } from "./rrFramework";

export interface PairStateInfo {
  symbol: string;
  state: "IDLE" | "ACTIVE" | "COOLDOWN" | "LOCKED";
  activeSignalId?: string;
  cooldownUntil?: number;
  lockUntil?: number;
  consecutiveLosses: number;
  hourlyTimestamps: number[];
  reason?: string;
}

const pairStateMap: Record<string, PairStateInfo> = {};

export function getPairState(symbol: string): PairStateInfo {
  if (!pairStateMap[symbol]) {
    pairStateMap[symbol] = {
      symbol,
      state: "IDLE",
      consecutiveLosses: 0,
      hourlyTimestamps: []
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

export function updatePairOnSignalClosed(symbol: string, result: "HIT TP" | "HIT SL") {
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
  }
}

export function canGenerateNewSignal(symbol: string): { allowed: boolean; reason?: string } {
  const info = getPairState(symbol);
  const now = Date.now();

  if (info.state === "ACTIVE") {
    return { allowed: false, reason: "Active signal already exists" };
  }

  if (info.state === "LOCKED") {
    return { allowed: false, reason: info.reason || "Pair is locked due to spam frequency" };
  }

  if (info.state === "COOLDOWN") {
    return { allowed: false, reason: info.reason || "Pair is in post-trade cooldown period" };
  }

  const recentTimestamps = info.hourlyTimestamps.filter((t) => now - t < 3600000);
  info.hourlyTimestamps = recentTimestamps;

  if (recentTimestamps.length >= 2) {
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

export function getSignalAgeString(fireTimestamp?: string): string {
  if (!fireTimestamp) return "Just now";
  const birth = new Date(fireTimestamp).getTime();
  if (isNaN(birth)) return "Just now";
  const diffSec = Math.max(0, Math.floor((Date.now() - birth) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `${mins}m ${secs}s ago`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function calculateSanitizedPipsOrPoints(
  symbol: string,
  entryPrice: number,
  exitPrice: number,
  direction: "BUY" | "SELL"
): { pipsOrPoints: number; pnlPct: number } {
  const isBuy = direction === "BUY";
  const priceDiff = isBuy ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pnlPct = (priceDiff / entryPrice) * 100;

  const isCryptoOrGold = symbol.includes("BTC") || symbol.includes("XAU") || symbol.includes("ETH") || symbol.includes("SOL");
  const isJpy = symbol.includes("JPY");

  let pipsOrPoints = 0;
  if (isCryptoOrGold) {
    pipsOrPoints = priceDiff;
    if (pipsOrPoints < -5000) pipsOrPoints = -5000;
    if (pipsOrPoints > 5000) pipsOrPoints = 5000;
  } else {
    const multiplier = isJpy ? 100 : 10000;
    pipsOrPoints = priceDiff * multiplier;
    if (pipsOrPoints < -500) pipsOrPoints = -500;
    if (pipsOrPoints > 500) pipsOrPoints = 500;
  }

  return {
    pipsOrPoints: parseFloat(pipsOrPoints.toFixed(1)),
    pnlPct: parseFloat(pnlPct.toFixed(2))
  };
}

export function deduplicateSignals(signals: AuditedSignalItem[]): AuditedSignalItem[] {
  const seen = new Set<string>();
  const result: AuditedSignalItem[] = [];

  for (const sig of signals) {
    const minuteKey = `${sig.symbol}-${sig.direction}-${sig.fireTimestamp.substring(0, 16)}`;
    if (seen.has(sig.id) || seen.has(minuteKey)) {
      continue;
    }
    seen.add(sig.id);
    seen.add(minuteKey);
    result.push(sig);
  }

  return result;
}

// NEW: Generate signal with enhanced data
export function generateEnhancedSignal(
  symbol: string,
  direction: "BUY" | "SELL",
  entryPrice: number,
  confidence: number,
  marketRegime: "TRENDING" | "RANGING" | "VOLATILE",
  features?: {
    atr?: number;
    rsi?: number;
    adx?: number;
  }
): Omit<AuditedSignalItem, "id"> {
  const rrProfile = getAssetRRProfile(symbol);
  const rrRatio = rrProfile.rrRatio;
  
  const isCrypto = symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("SOL");
  const isGold = symbol.includes("XAU");
  
  // Calculate TP and SL based on ATR or price
  let tpDistance: number;
  let slDistance: number;
  
  if (features?.atr && features.atr > 0) {
    const atrMult = marketRegime === "TRENDING" ? 1.5 : marketRegime === "VOLATILE" ? 2.5 : 1.0;
    tpDistance = features.atr * atrMult * rrRatio;
    slDistance = features.atr * atrMult;
  } else {
    // Fallback to percentage
    tpDistance = entryPrice * 0.01 * rrRatio;
    slDistance = entryPrice * 0.01;
  }
  
  const tpPrice = direction === "BUY" ? entryPrice + tpDistance : entryPrice - tpDistance;
  const slPrice = direction === "BUY" ? entryPrice - slDistance : entryPrice + slDistance;
  
  // Calculate signal score (mock for now)
  const signalScore = Math.min(100, Math.round(confidence * 100));
  
  // Risk reward achieved (actual R:R)
  const actualRisk = Math.abs(entryPrice - slPrice);
  const actualReward = Math.abs(tpPrice - entryPrice);
  const riskReward = actualReward / actualRisk;
  
  return {
    timestamp: new Date().toISOString(),
    month: new Date().toISOString().substring(0, 7),
    symbol,
    direction,
    entryPrice,
    tpPrice,
    slPrice,
    result: "ACTIVE",
    pipsOrPoints: 0,
    pnlPct: 0,
    rrAchieved: riskReward,
    priceAtFire: entryPrice,
    fireTimestamp: new Date().toISOString(),
    confidence,
    reason: `${marketRegime} setup | Score: ${signalScore}/100`,
    signalScore,
    marketRegime,
    riskReward: rrRatio
  };
}
