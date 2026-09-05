// Shared signal schema used by both the server engine and the client.

export type SignalStatus =
  | "ACTIVE"
  | "HIT TP"
  | "HIT SL"
  | "HIT_TP"
  | "HIT_SL"
  | "EXPIRED"
  | "STALE"
  | "SKIPPED";

export interface ServerSignal {
  id: string;
  timestamp: string;
  month: string;
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  exitPrice?: number;
  result: SignalStatus;
  status?: SignalStatus;
  pipsOrPoints: number;
  pnlPct: number;
  rrAchieved: number;
  priceAtFire: number;
  fireTimestamp: string;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  resultPips?: number | null;
  timeToClose?: string;
  confidence?: number;
  reason?: string;
  signalScore?: number;
  marketRegime?: "TRENDING" | "RANGING" | "VOLATILE";
  riskReward?: number;
}

export interface PairState {
  symbol: string;
  state: "IDLE" | "ACTIVE" | "COOLDOWN" | "LOCKED";
  activeSignalId?: string;
  cooldownUntil?: number;
  lockUntil?: number;
  consecutiveLosses: number;
  hourlyTimestamps: number[];
  reason?: string;
}

export interface ScanSnapshot {
  symbol: string;
  price: number;
  changePct: number;
  recommendation: string;
  confidence: number;
  rsi: number;
  atr: number;
  ema20?: number;
  ema50?: number;
  marketStatus?: {
    isOpen: boolean;
    statusText: string;
  };
  isStale?: boolean;
  staleReason?: string;
  dataSource?: string;
}

export interface ReconcilerResult {
  generated: number;
  expired: number;
  closed: number;
  totalActive: number;
  scanned: number;
  ranAt: string;
}