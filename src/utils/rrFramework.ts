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

export function getAssetRRProfile(symbol: string, date: Date = new Date()): AssetRRProfile {
  const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const hour = date.getUTCHours();

  // 1. GOLD (XAUUSD)
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
    } else {
      sessionName = "London Session";
      rrRatio = 2.5;
      tooltip = "Gold London Session — High volatility profile";
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

  // 2. BITCOIN (BTCUSD)
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

  // 3. ETHEREUM / SOLANA (ETHUSD, SOLUSD)
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

  // 4. JPY PAIRS (USDJPY, EURJPY, GBPJPY, AUDJPY, CADJPY, CHFJPY)
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

  // 5. FOREX MAJORS
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

  // 6. CROSSES / DEFAULT
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
