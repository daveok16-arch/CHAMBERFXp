export interface MarketStatus {
  isOpen: boolean;
  isLowLiquidity: boolean;
  statusText: "OPEN" | "CLOSED" | "LOW LIQUIDITY";
  reasonText: string;
  nextOpenText?: string;
  badgeColor: "emerald" | "amber" | "slate";
}

/**
 * Checks market status for a given trading symbol based on UTC time.
 * - Forex: Open Sun 22:00 UTC to Fri 22:00 UTC
 * - Gold (XAUUSD): Open Sun 23:00 UTC to Fri 22:00 UTC; Low Liquidity Mon-Fri 00:00-08:00 UTC
 * - Crypto (BTC, ETH, SOL): Open 24/7/365
 */
export function getMarketStatus(symbol: string, date: Date = new Date()): MarketStatus {
  const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Crypto: Always open 24/7
  if (cleanSym.includes("BTC") || cleanSym.includes("ETH") || cleanSym.includes("SOL")) {
    return {
      isOpen: true,
      isLowLiquidity: false,
      statusText: "OPEN",
      reasonText: "24/7 Crypto Market",
      badgeColor: "emerald"
    };
  }

  const day = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hour = date.getUTCHours();

  // Gold (XAUUSD)
  if (cleanSym.includes("XAU") || cleanSym.includes("GOLD")) {
    // Weekend closure: Fri 22:00 UTC to Sun 23:00 UTC
    const isFridayAfterClose = day === 5 && hour >= 22;
    const isSaturday = day === 6;
    const isSundayBeforeOpen = day === 0 && hour < 23;

    if (isFridayAfterClose || isSaturday || isSundayBeforeOpen) {
      return {
        isOpen: false,
        isLowLiquidity: false,
        statusText: "CLOSED",
        reasonText: "MARKET CLOSED — Opens Sunday 23:00 UTC",
        nextOpenText: "Sunday 23:00 UTC",
        badgeColor: "slate"
      };
    }

    // Weekday Asian session low liquidity (00:00 to 08:00 UTC Mon-Fri)
    if (day >= 1 && day <= 5 && hour < 8) {
      return {
        isOpen: true,
        isLowLiquidity: true,
        statusText: "LOW LIQUIDITY",
        reasonText: "LOW LIQUIDITY — Wider spreads expected during Asian session",
        badgeColor: "amber"
      };
    }

    return {
      isOpen: true,
      isLowLiquidity: false,
      statusText: "OPEN",
      reasonText: "Gold Market Active",
      badgeColor: "emerald"
    };
  }

  // Forex Pairs (EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF, etc.)
  // Weekend closure: Fri 22:00 UTC to Sun 22:00 UTC
  const isFridayAfterClose = day === 5 && hour >= 22;
  const isSaturday = day === 6;
  const isSundayBeforeOpen = day === 0 && hour < 22;

  if (isFridayAfterClose || isSaturday || isSundayBeforeOpen) {
    return {
      isOpen: false,
      isLowLiquidity: false,
      statusText: "CLOSED",
      reasonText: "MARKET CLOSED — Opens Sunday 22:00 UTC",
      nextOpenText: "Sunday 22:00 UTC",
      badgeColor: "slate"
    };
  }

  return {
    isOpen: true,
    isLowLiquidity: false,
    statusText: "OPEN",
    reasonText: "Forex Market Active",
    badgeColor: "emerald"
  };
}

/**
 * Calculates active signal age in seconds, excluding weekend closed hours for Forex and Gold.
 */
export function calculateMarketAwareAge(
  symbol: string,
  fireTime: Date | string | number,
  nowTime: Date = new Date()
): { totalSeconds: number; activeTradingSeconds: number; formattedAge: string; wasPausedForWeekend: boolean } {
  const fireDate = new Date(fireTime);
  const now = new Date(nowTime);

  const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isCrypto = cleanSym.includes("BTC") || cleanSym.includes("ETH") || cleanSym.includes("SOL");

  const totalMs = Math.max(0, now.getTime() - fireDate.getTime());
  const totalSeconds = Math.floor(totalMs / 1000);

  if (isCrypto) {
    return {
      totalSeconds,
      activeTradingSeconds: totalSeconds,
      formattedAge: formatAgeString(totalSeconds),
      wasPausedForWeekend: false
    };
  }

  // Iterate hour by hour or in 15-min steps from fireDate to now and accumulate active market seconds
  let activeMs = 0;
  let curr = new Date(fireDate.getTime());
  const stepMs = 15 * 60 * 1000; // 15 minute step

  while (curr.getTime() < now.getTime()) {
    const nextStep = new Date(Math.min(now.getTime(), curr.getTime() + stepMs));
    const midPoint = new Date(curr.getTime() + (nextStep.getTime() - curr.getTime()) / 2);
    const status = getMarketStatus(symbol, midPoint);

    if (status.isOpen) {
      activeMs += (nextStep.getTime() - curr.getTime());
    }

    curr = nextStep;
  }

  const activeTradingSeconds = Math.floor(activeMs / 1000);
  const wasPausedForWeekend = totalSeconds - activeTradingSeconds > 3600;

  return {
    totalSeconds,
    activeTradingSeconds,
    formattedAge: formatAgeString(activeTradingSeconds),
    wasPausedForWeekend
  };
}

function formatAgeString(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${seconds % 60}s ago`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m ago`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h ago`;
}
