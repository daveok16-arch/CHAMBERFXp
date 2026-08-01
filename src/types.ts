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
    expectancy?: number;
    avgWin?: number;
    avgLoss?: number;
  };
  equityCurve: number[];
  trades: Array<ExecutionLog>;
}

export interface WalkForwardResults {
  windows: Array<BacktestResults & { window_start: number; window_end: number }>;
  avg_return: number;
  avg_win_rate: number;
  avg_sharpe: number;
  consistency: number;
}

export interface MonteCarloResults {
  median_equity: number;
  percentile_5: number;
  percentile_95: number;
  max_loss: number;
  max_win: number;
  probability_of_profit: number;
}

export interface ForexPairData {
  symbol: string;
  price: number;
  prevClose: number;
  highRate: number;
  lowRate: number;
  changePct: number;
}

export interface MarketRegime {
  type: "TRENDING" | "RANGING" | "VOLATILE";
  adx: number;
  atr: number;
  plus_di: number;
  minus_di: number;
  description: string;
}

export interface SignalQuality {
  compositeScore: number;
  mlConfidence: number;
  rsiAlignment: number;
  trendStrength: number;
  mtfAlignment: number;
  volumeConfirmation: number;
  adxConfirmation: number;
}

export interface EnhancedIndicators {
  rsi: number;
  rsi_7: number;
  rsi_smooth: number;
  stoch_k: number;
  stoch_d: number;
  cci: number;
  momentum: number;
  roc: number;
  williams_r: number;
  ultimate_osc: number;
  macd_line: number;
  macd_signal: number;
  macd_hist: number;
  adx: number;
  plus_di: number;
  minus_di: number;
  supertrend_dir: number;
  atr: number;
  bb_width: number;
  bb_position: number;
}

export interface TradingPair {
  symbol: string;
  name: string;
  type: "CRYPTO" | "FOREX" | "COMMODITY";
  priority: number;
}

export interface MarketStatus {
  name: string;
  isOpen: boolean;
  sessions: {
    london: boolean;
    newYork: boolean;
    tokyo: boolean;
    sydney: boolean;
  };
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
  signalScore?: number;
  marketRegime?: "TRENDING" | "RANGING" | "VOLATILE";
  riskReward?: number;
}
