import { MarketRegime, SignalQuality } from "../types";

export interface AssetRRProfile {
  assetClass: "GOLD" | "BITCOIN" | "ALTCOIN" | "FOREX_MAJOR" | "JPY_PAIR" | "CROSS";
  rrRatio: number;
  rrString: string;
  tpMultiplier: number;
  slMultiplier: number;
  sessionName: string;
  rationale: string;
  profileSummary: string;
  badgeStyle: "amber" | "blue" | "forex";
  tooltip: string;
}

export interface KellyPosition {
  kellyFraction: number;
  optimalFraction: number;
  riskAmount: number;
  positionSize: number;
  recommendedRisk: number;
}

export interface DynamicSLTP {
  stopLoss: number;
  takeProfit: number;
  trailingStop: number;
  riskReward: number;
  atrMultiplier: number;
  regime: "TRENDING" | "RANGING" | "VOLATILE";
}

export function getAssetRRProfile(symbol: string, date: Date = new Date()): AssetRRProfile {
  const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const hour = date.getUTCHours();

  // GOLD (XAUUSD)
  if (cleanSym.includes("XAU") || cleanSym.includes("GOLD")) {
    let sessionName = "London Session";
    let rrRatio = 2.5;
    let tooltip = "Gold London Session — High volatility profile";

    if (hour >= 0 && hour < 8) {
      sessionName = "Asian Session";
      rrRatio = 3.0;
      tooltip = "Gold Asian Session — Tight range & fakeouts profile";
    } else if (hour >= 12 && hour < 16) {
      sessionName = "London/NY Overlap";
      rrRatio = 2.0;
      tooltip = "Gold London/NY Overlap — Real trend move profile";
    } else if (hour >= 20 && hour < 24) {
      sessionName = "NY Close";
      rrRatio = 3.0;
      tooltip = "Gold NY Close — Low liquidity & gap risk profile";
    } else if (hour >= 16 && hour < 20) {
      sessionName = "NY Session";
      rrRatio = 2.5;
      tooltip = "Gold NY Session — High volatility profile";
    }

    return {
      assetClass: "GOLD",
      rrRatio,
      rrString: `1:${rrRatio.toFixed(1)}`,
      tpMultiplier: rrRatio,
      slMultiplier: 1.0,
      sessionName,
      rationale: "Gold has high noise, frequent stop hunts, and violent news-driven moves. Needs higher reward per unit of risk.",
      profileSummary: `Gold / ${sessionName} / 1:${rrRatio.toFixed(1)}`,
      badgeStyle: "amber",
      tooltip
    };
  }

  // BITCOIN (BTCUSD)
  if (cleanSym.includes("BTC")) {
    return {
      assetClass: "BITCOIN",
      rrRatio: 2.0,
      rrString: "1:2.0",
      tpMultiplier: 2.0,
      slMultiplier: 1.0,
      sessionName: "24/7 Market",
      rationale: "24/7 market, funding rate squeezes, exchange wicks. Needs wider TP.",
      profileSummary: "Bitcoin / 24/7 Market / 1:2.0",
      badgeStyle: "blue",
      tooltip: "Bitcoin 24/7 Market — Funding squeeze & wick buffer profile"
    };
  }

  // ETHEREUM / SOLANA
  if (cleanSym.includes("ETH")) {
    return {
      assetClass: "ALTCOIN",
      rrRatio: 2.0,
      rrString: "1:2.0",
      tpMultiplier: 2.0,
      slMultiplier: 1.0,
      sessionName: "24/7 Market",
      rationale: "High market-cap layer 1 asset, funding volatility.",
      profileSummary: "Ethereum / 24/7 Market / 1:2.0",
      badgeStyle: "blue",
      tooltip: "Ethereum 24/7 Market — High market-cap layer-1 profile"
    };
  }

  if (cleanSym.includes("SOL")) {
    return {
      assetClass: "ALTCOIN",
      rrRatio: 1.5,
      rrString: "1:1.5",
      tpMultiplier: 1.5,
      slMultiplier: 1.0,
      sessionName: "24/7 Market",
      rationale: "Mid market-cap layer 1 asset, scaled volatility target.",
      profileSummary: "Solana / 24/7 Market / 1:1.5",
      badgeStyle: "blue",
      tooltip: "Solana 24/7 Market — Mid market-cap layer-1 profile"
    };
  }

  // JPY PAIRS
  if (cleanSym.includes("JPY")) {
    let fxSession = "London Session";
    if (hour >= 0 && hour < 8) fxSession = "Asian Session";
    else if (hour >= 16 && hour < 24) fxSession = "NY Session";

    let rrRatio = 1.3;
    if (cleanSym.includes("USD")) rrRatio = 1.2;
    if (cleanSym.includes("GBP")) rrRatio = 1.5;

    const basePair = cleanSym.replace("JPY", "") + "JPY";

    return {
      assetClass: "JPY_PAIR",
      rrRatio,
      rrString: `1:${rrRatio.toFixed(1)}`,
      tpMultiplier: rrRatio,
      slMultiplier: 1.0,
      sessionName: fxSession,
      rationale: "BOJ intervention risk, sudden 100-pip reversals. Tighter targets, faster exits.",
      profileSummary: `${basePair} / ${fxSession} / 1:${rrRatio.toFixed(1)}`,
      badgeStyle: "forex",
      tooltip: `${basePair} ${fxSession} — JPY reversal protection profile`
    };
  }

  // FOREX MAJORS
  const majors = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"];
  if (majors.includes(cleanSym)) {
    let fxSession = "London Session";
    if (hour >= 0 && hour < 8) fxSession = "Asian Session";
    else if (hour >= 16 && hour < 24) fxSession = "NY Session";

    return {
      assetClass: "FOREX_MAJOR",
      rrRatio: 1.5,
      rrString: "1:1.5",
      tpMultiplier: 1.5,
      slMultiplier: 1.0,
      sessionName: fxSession,
      rationale: "Liquid, tight spreads, predictable ranges.",
      profileSummary: `${cleanSym} / ${fxSession} / 1:1.5`,
      badgeStyle: "forex",
      tooltip: `${cleanSym} ${fxSession} — Liquid range profile`
    };
  }

  // CROSSES / DEFAULT
  let fxSession = "London Session";
  if (hour >= 0 && hour < 8) fxSession = "Asian Session";
  else if (hour >= 16 && hour < 24) fxSession = "NY Session";

  return {
    assetClass: "CROSS",
    rrRatio: 1.5,
    rrString: "1:1.5",
    tpMultiplier: 1.5,
    slMultiplier: 1.0,
    sessionName: fxSession,
    rationale: "Cross pair range/trend structure.",
    profileSummary: `${cleanSym} / ${fxSession} / 1:1.5`,
    badgeStyle: "forex",
    tooltip: `${cleanSym} ${fxSession} — Cross pair structure profile`
  };
}

// NEW: Kelly Criterion Position Sizing
export function calculateKellyPosition(
  winRate: number,
  avgWin: number,
  avgLoss: number,
  accountBalance: number,
  kellyFraction: number = 0.25
): KellyPosition {
  // Kelly formula: f* = (bp - q) / b
  // where b = avgWin/avgLoss, p = winRate, q = 1 - p
  const b = avgWin / Math.abs(avgLoss);
  const p = winRate;
  const q = 1 - p;
  
  const kellyFull = (b * p - q) / b;
  const kellyOptimal = Math.max(0, kellyFull) * kellyFraction;
  
  // Position size = account * kelly fraction
  const positionSize = accountBalance * kellyOptimal;
  
  // Risk amount (1% default)
  const riskAmount = accountBalance * 0.01;
  
  return {
    kellyFraction: kellyOptimal,
    optimalFraction: kellyFull,
    riskAmount,
    positionSize,
    recommendedRisk: 0.01 // 1% of account
  };
}

// NEW: Dynamic Stop Loss / Take Profit based on regime
export function calculateDynamicSLTP(
  entryPrice: number,
  atr: number,
  regime: "TRENDING" | "RANGING" | "VOLATILE",
  direction: "BUY" | "SELL",
  baseRR: number = 2.0
): DynamicSLTP {
  let atrMultiplier: number;
  
  switch (regime) {
    case "TRENDING":
      // Wider stops, wider targets in trending markets
      atrMultiplier = 1.5;
      break;
    case "VOLATILE":
      // Very wide stops in volatile markets
      atrMultiplier = 2.5;
      break;
    case "RANGING":
    default:
      // Tight stops in ranging markets
      atrMultiplier = 1.0;
      break;
  }
  
  const slDistance = atr * atrMultiplier;
  const tpDistance = slDistance * baseRR;
  
  let stopLoss: number;
  let takeProfit: number;
  
  if (direction === "BUY") {
    stopLoss = entryPrice - slDistance;
    takeProfit = entryPrice + tpDistance;
  } else {
    stopLoss = entryPrice + slDistance;
    takeProfit = entryPrice - tpDistance;
  }
  
  // Trailing stop activates after 1.5R profit
  const trailingActivation = tpDistance * 1.5;
  const trailingStop = direction === "BUY" 
    ? entryPrice + trailingActivation - atr * 1.0
    : entryPrice - trailingActivation + atr * 1.0;
  
  return {
    stopLoss,
    takeProfit,
    trailingStop,
    riskReward: baseRR,
    atrMultiplier,
    regime
  };
}

// NEW: Detect market regime from indicators
export function detectRegimeFromIndicators(
  adx: number,
  atrPct: number,
  bbWidth: number
): MarketRegime {
  // High volatility
  if (atrPct > 2.5 || bbWidth > 0.1) {
    return {
      type: "VOLATILE",
      adx,
      atr: atrPct,
      plus_di: 0,
      minus_di: 0,
      description: "High volatility detected — extra confirmation required"
    };
  }
  
  // Strong trend
  if (adx > 25) {
    return {
      type: "TRENDING",
      adx,
      atr: atrPct,
      plus_di: 0,
      minus_di: 0,
      description: "Trending market — momentum strategies favored"
    };
  }
  
  // Ranging
  return {
    type: "RANGING",
    adx,
    atr: atrPct,
    plus_di: 0,
    minus_di: 0,
    description: "Ranging market — mean reversion at extremes"
  };
}

// NEW: Calculate composite signal score
export function calculateSignalScore(
  mlConfidence: number,
  rsi: number,
  trendStrength: number,
  mtfAlignment: number,
  volumeRatio: number,
  adx: number,
  direction: 1 | -1
): SignalQuality {
  let score = 0;
  
  // ML Confidence (40%)
  score += mlConfidence * 0.40;
  
  // RSI alignment (15%)
  let rsiScore = 0;
  if (direction === 1 && rsi < 40) rsiScore = 1;
  if (direction === -1 && rsi > 60) rsiScore = 1;
  if (direction === 1 && rsi < 30) rsiScore = 1.5;
  if (direction === -1 && rsi > 70) rsiScore = 1.5;
  score += Math.min(1, rsiScore) * 0.15;
  
  // Trend strength (15%)
  const trendAligned = (direction === 1 && trendStrength > 0) || (direction === -1 && trendStrength < 0);
  score += (trendAligned ? 1 : 0) * Math.min(1, Math.abs(trendStrength)) * 0.15;
  
  // MTF alignment (15%)
  score += Math.abs(mtfAlignment) * 0.15;
  
  // Volume confirmation (10%)
  const volumeConfirmed = volumeRatio > 1.2;
  score += (volumeConfirmed ? 1 : 0.5) * 0.10;
  
  // ADX confirmation (5%)
  score += (adx > 25 ? 1 : adx > 20 ? 0.5 : 0) * 0.05;
  
  return {
    compositeScore: Math.min(100, Math.round(score * 100)),
    mlConfidence,
    rsiAlignment: rsiScore,
    trendStrength,
    mtfAlignment,
    volumeConfirmation: volumeRatio,
    adxConfirmation: adx
  };
}
