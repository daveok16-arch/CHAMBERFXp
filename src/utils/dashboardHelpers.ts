// Pure helper functions extracted from Dashboard.tsx
import { MarketStatus } from "./marketHours";

export interface MarqueeScanItem {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  recommendation: "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL" | "CLOSED";
  confidence: number;
  rsi: number;
  targets?: {
    entry: number;
    target1: number;
    target2: number;
    stopLoss: number;
  } | null;
  marketStatus?: MarketStatus;
  macd?: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  ema20?: number;
  ema50?: number;
  isVolatile: boolean;
  type: "CRYPTO" | "FOREX" | "OTHER";
  volatilityRating: "HIGH" | "MEDIUM" | "LOW";
  liquidityScore: number;
  momentumScore: number;
  probabilityScore: number;
  marketRegime: string;
  signalStrength: number;
  status: "ACTIVE" | "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "EXPIRED";
  lastUpdated?: string;
  lastUpdatedTimestamp?: number;
  dataSource?: string;
  isStale?: boolean;
  staleReason?: string;
  atr?: number;
  barsCount?: number;
  rsi15m?: number;
  rsi1h?: number;
  rsi1d?: number;
  indicatorsScan?: {
    rsiStatus: string;
    macdStatus: string;
    maStatus: string;
    bullishIndicators: number;
    bearishIndicators: number;
  };
  keyLevelsCalc?: {
    s1: number;
    s1Source: string;
    r1: number;
    r1Source: string;
    pivotP?: number;
    pivotS1?: number;
    pivotR1?: number;
    pivotS2?: number;
    pivotR2?: number;
    recentLow?: number;
    recentHigh?: number;
  };
}

export const formatValue = (sym: string, val: number) => {
    const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
    if (baseSym === "XAUUSD") {
      return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const isCrypto = ["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym);
    if (isCrypto) {
      return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const isJPY = baseSym.includes("JPY");
    if (isJPY) {
      return val.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    }
    return val.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 });
  };

export const getCleanLabel = (sym: string) => {
    const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
    const map: Record<string, string> = {
      BTCUSD: "Bitcoin (BTC/USD)",
      ETHUSD: "Ethereum (ETH/USD)",
      SOLUSD: "Solana (SOL/USD)",
      XAUUSD: "Gold Spot (XAU/USD)",
      EURUSD: "Euro (EUR/USD)",
      GBPUSD: "British Pound (GBP/USD)",
      USDJPY: "Dollar / Yen (USD/JPY)",
      AUDUSD: "Aussie Dollar (AUD/USD)",
      USDCAD: "Dollar / CAD (USD/CAD)",
      USDCHF: "Dollar / Franc (USD/CHF)",
      NZDUSD: "Kiwi Dollar (NZD/USD)",
      EURGBP: "Euro / Pound (EUR/GBP)",
      EURJPY: "Euro / Yen (EUR/JPY)",
      GBPJPY: "Pound / Yen (GBP/JPY)"
    };
    return map[baseSym] || sym;
  };

export const calculateIsStale = (item: MarqueeScanItem) => {
    const now = Date.now();
    const timestamp = item.lastUpdatedTimestamp || now;
    const ageSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
    const ageMins = ageSeconds / 60;

    if (item.isStale) {
      return { isStale: true, reason: item.staleReason || "STALE DATA FEED", ageSeconds, ageMins };
    }

    if (item.targets?.entry && item.price) {
      const diff = Math.abs(item.price - item.targets.entry);
      const baseSym = item.symbol.endsWith("m") ? item.symbol.slice(0, -1) : item.symbol;

      // Stricter thresholds for faster signal refresh
      if (["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym)) {
        const pct = (diff / item.price) * 100;
        // Crypto: mark stale if > 0.1% drift (~$63 for BTC) or >2 mins old with >0.05% drift
        if (pct > 0.1) return { isStale: true, reason: `Price drifted ${pct.toFixed(2)}% from entry`, ageSeconds, ageMins };
        if (ageMins > 2 && pct > 0.05) return { isStale: true, reason: `Signal >2m & price moved ${pct.toFixed(2)}%`, ageSeconds, ageMins };
      } else if (baseSym === "XAUUSD") {
        // Gold: mark stale if > $5 drift or >2 mins old with >$2 drift
        if (diff > 5) return { isStale: true, reason: `Gold drifted $${diff.toFixed(2)} from entry`, ageSeconds, ageMins };
        if (ageMins > 2 && diff > 2) return { isStale: true, reason: `Signal >2m & Gold moved $${diff.toFixed(2)}`, ageSeconds, ageMins };
      } else {
        const isJPY = baseSym.includes("JPY");
        const pips = isJPY ? diff * 100 : diff * 10000;
        // Forex: mark stale if > 3 pips drift or >2 mins old with >1 pip drift
        if (pips > 3) return { isStale: true, reason: `Forex drifted ${pips.toFixed(1)} pips from entry`, ageSeconds, ageMins };
        if (ageMins > 2 && pips > 1) return { isStale: true, reason: `Signal >2m & price moved ${pips.toFixed(1)} pips`, ageSeconds, ageMins };
      }
    }
    return { isStale: false, reason: "", ageSeconds, ageMins };
  };

export const formatSignalAge = (ageSeconds: number) => {
    if (ageSeconds < 60) return `${ageSeconds}s ago`;
    const m = Math.floor(ageSeconds / 60);
    const s = ageSeconds % 60;
    return `${m}m ${s}s ago`;
  };

