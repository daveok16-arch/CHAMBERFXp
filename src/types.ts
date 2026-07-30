export interface TickerData {
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  changePct: number;
}

export interface PyFile {
  filename: string;
  content: string;
}

export interface ExecutionLog {
  entry_time?: string;
  entryTime?: string;
  exit_time?: string;
  exitTime?: string;
  direction: string;
  entryPrice: number;
  entry_price?: number;
  exitPrice: number;
  exit_price?: number;
  pnl_pct?: number;
  pnlPct?: number;
  net_pnl_usd?: number;
  netPnlUsd?: number;
  confidence: number;
}

export interface PredictionDbRow {
  id: number;
  timestamp: string;
  symbol: string;
  predicted_direction: number;
  confidence_score: number;
  actual_outcome: number | null;
  model_version: string;
}

export interface TradeDbRow {
  id: number;
  entry_timestamp: string;
  exit_timestamp: string | null;
  symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  pnl_pct: number | null;
  confidence: number;
  status: string;
}

export interface BacktestResults {
  metrics: {
    totalReturnPct: number;
    finalBalance: number;
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
  };
  candles: Array<{
    time: number;
    formattedTime: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    rsi: number;
    macdHist: number;
    adx: number;
    atr: number;
    bbWidth: number;
    direction: number;
    confidence: number;
    action: string;
    reason: string;
    equity: number;
  }>;
  trades: Array<ExecutionLog>;
}

export interface ForexPairData {
  symbol: string;
  price: number;
  prevClose: number;
  highRate: number;
  lowRate: number;
  changePct: number;
}

export interface AuditedSignalItem {
  id: string;
  timestamp: string;
  month: string;
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  exitPrice?: number;
  result: "HIT_TP" | "HIT_SL" | "HIT TP" | "HIT SL" | "WIN" | "LOSS" | "ACTIVE" | "EXPIRED" | "STALE" | "SKIPPED";
  status?: "ACTIVE" | "HIT_TP" | "HIT_SL" | "HIT TP" | "HIT SL" | "EXPIRED" | "STALE" | "SKIPPED";
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
}

