import { useState, useEffect } from "react";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Sparkles,
  X,
  Vault,
  Activity,
  ShieldAlert,
  Compass,
  Sliders,
  Search,
  TrendingUp,
  AlertTriangle,
  Info,
  CheckCircle2
} from "lucide-react";
import { getAssetRRProfile } from "../utils/rrFramework";
import { getMarketStatus, calculateMarketAwareAge, MarketStatus } from "../utils/marketHours";
import { formatValue, getCleanLabel, calculateIsStale, MarqueeScanItem } from "../utils/dashboardHelpers";
import { AuditedSignalItem } from "../types";
import {
  canGenerateNewSignal,
  recordSignalGenerated,
  updatePairOnSignalClosed,
  calculateSanitizedPipsOrPoints,
  deduplicateSignals,
  getSignalAgeString,
  getPairState
} from "../utils/signalEngine";


interface ToastMessage {
  id: string;
  text: string;
  type: "success" | "info" | "error" | "warning";
}

const getStaticMetadata = (sym: string) => {
  const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
  const metaMap: Record<string, { status: string; timestamp: string; strength: string }> = {
    BTCUSD: { status: "Active", timestamp: "1 min ago", strength: "Extremely Bullish Alignment" },
    XAUUSD: { status: "Active", timestamp: "3 mins ago", strength: "Institutional Squeeze Potential" },
    ETHUSD: { status: "Active", timestamp: "18 mins ago", strength: "Dynamic Breakout Retest" },
    GBPUSD: { status: "Active", timestamp: "32 mins ago", strength: "Macro Range Rebound" },
    SOLUSD: { status: "Active", timestamp: "1 hour ago", strength: "High Volatility Push" },
    EURUSD: { status: "Active", timestamp: "Just now", strength: "Liquidity Sweep Continuation" },
    USDJPY: { status: "Active", timestamp: "2 mins ago", strength: "Trend channel breakout" }
  };
  return metaMap[baseSym] || { status: "Active", timestamp: "Just now", strength: "Quantum Signal Aligned" };
};

export default function Dashboard() {
  const [marketScans, setMarketScans] = useState<MarqueeScanItem[]>([]);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [marketContextOpen, setMarketContextOpen] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchExpanded, setSearchExpanded] = useState<boolean>(false);
  const [tickStates, setTickStates] = useState<Record<string, "UP" | "DOWN" | null>>({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [, setCountdown] = useState<number>(10);
  const [liveUtcTime, setLiveUtcTime] = useState<string>("");
  const [rrFlashMap, setRrFlashMap] = useState<Record<string, string>>({});
  const [prevRrState, setPrevRrState] = useState<Record<string, { ratio: string; session: string }>>({});
  const [signals, setSignals] = useState<AuditedSignalItem[]>([]);

  const initialAssetFeed: MarqueeScanItem[] = [
    {
      symbol: "BTCUSD",
      name: "Bitcoin / USD",
      price: 67240.50,
      changePct: 3.42,
      recommendation: "STRONG BUY",
      confidence: 94,
      rsi: 61.2,
      targets: { entry: 67240.50, target1: 68640.50, target2: 69940.50, stopLoss: 66240.50 },
      isVolatile: false,
      type: "CRYPTO",
      volatilityRating: "MEDIUM",
      liquidityScore: 98,
      momentumScore: 89,
      probabilityScore: 92,
      marketRegime: "Aggressive Expansion Drive",
      signalStrength: 94,
      status: "ACTIVE"
    },
    {
      symbol: "XAUUSD",
      name: "Gold / USD Spot",
      price: 4068.50,
      changePct: 0.81,
      recommendation: "BUY",
      confidence: 90,
      rsi: 58.4,
      targets: { entry: 4068.50, target1: 4110.50, target2: 4155.50, stopLoss: 4038.50 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "LOW",
      liquidityScore: 96,
      momentumScore: 78,
      probabilityScore: 88,
      marketRegime: "Slow Accumulation Squeeze",
      signalStrength: 89,
      status: "ACTIVE"
    },
    {
      symbol: "ETHUSD",
      name: "Ethereum / USD",
      price: 3485.20,
      changePct: -1.24,
      recommendation: "SELL",
      confidence: 76,
      rsi: 45.1,
      targets: { entry: 3485.20, target1: 3410.20, target2: 3350.20, stopLoss: 3550.20 },
      isVolatile: false,
      type: "CRYPTO",
      volatilityRating: "MEDIUM",
      liquidityScore: 94,
      momentumScore: 42,
      probabilityScore: 71,
      marketRegime: "High Timeframe Equilibrium",
      signalStrength: 76,
      status: "ACTIVE"
    },
    {
      symbol: "SOLUSD",
      name: "Solana / USD",
      price: 142.15,
      changePct: 5.61,
      recommendation: "STRONG BUY",
      confidence: 91,
      rsi: 68.3,
      targets: { entry: 142.15, target1: 148.65, target2: 154.65, stopLoss: 137.15 },
      isVolatile: true,
      type: "CRYPTO",
      volatilityRating: "HIGH",
      liquidityScore: 90,
      momentumScore: 92,
      probabilityScore: 89,
      marketRegime: "Excess Liquidity Injection",
      signalStrength: 91,
      status: "ACTIVE"
    },
    {
      symbol: "EURUSD",
      name: "Euro / US Dollar",
      price: 1.08542,
      changePct: 0.12,
      recommendation: "BUY",
      confidence: 84,
      rsi: 54.2,
      targets: { entry: 1.08542, target1: 1.09242, target2: 1.09882, stopLoss: 1.07982 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "LOW",
      liquidityScore: 99,
      momentumScore: 68,
      probabilityScore: 82,
      marketRegime: "Intraday Range Expansion",
      signalStrength: 84,
      status: "ACTIVE"
    },
    {
      symbol: "GBPUSD",
      name: "Pound / US Dollar",
      price: 1.26724,
      changePct: -0.08,
      recommendation: "NEUTRAL",
      confidence: 58,
      rsi: 49.8,
      targets: { entry: 1.26500, target1: 1.27200, target2: 1.27800, stopLoss: 1.25900 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "LOW",
      liquidityScore: 91,
      momentumScore: 48,
      probabilityScore: 54,
      marketRegime: "Stationary Distribution Range",
      signalStrength: 58,
      status: "ACTIVE"
    },
    {
      symbol: "USDJPY",
      name: "Dollar / Yen",
      price: 154.652,
      changePct: 0.45,
      recommendation: "STRONG BUY",
      confidence: 89,
      rsi: 64.1,
      targets: { entry: 154.500, target1: 155.800, target2: 156.400, stopLoss: 153.800 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "MEDIUM",
      liquidityScore: 97,
      momentumScore: 82,
      probabilityScore: 88,
      marketRegime: "Short-Term Carry Driver",
      signalStrength: 89,
      status: "ACTIVE"
    },
    {
      symbol: "AUDUSD",
      name: "Aussie / US Dollar",
      price: 0.65821,
      changePct: -0.22,
      recommendation: "SELL",
      confidence: 74,
      rsi: 42.1,
      targets: { entry: 0.65900, target1: 0.65150, target2: 0.64750, stopLoss: 0.66350 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "LOW",
      liquidityScore: 88,
      momentumScore: 35,
      probabilityScore: 72,
      marketRegime: "Commodity Vector Retract",
      signalStrength: 74,
      status: "ACTIVE"
    },
    {
      symbol: "USDCAD",
      name: "Dollar / Canadian",
      price: 1.36534,
      changePct: 0.05,
      recommendation: "BUY",
      confidence: 70,
      rsi: 52.8,
      targets: { entry: 1.36450, target1: 1.37200, target2: 1.37850, stopLoss: 1.35850 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "LOW",
      liquidityScore: 89,
      momentumScore: 55,
      probabilityScore: 68,
      marketRegime: "Ascending Triangle Wedge",
      signalStrength: 70,
      status: "ACTIVE"
    },
    {
      symbol: "USDCHF",
      name: "Dollar / Franc",
      price: 0.89542,
      changePct: -0.11,
      recommendation: "SELL",
      confidence: 72,
      rsi: 44.5,
      targets: { entry: 0.89620, target1: 0.88950, target2: 0.88450, stopLoss: 0.90150 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "LOW",
      liquidityScore: 86,
      momentumScore: 38,
      probabilityScore: 70,
      marketRegime: "Safe-Haven Bid Outflow",
      signalStrength: 72,
      status: "ACTIVE"
    },
    {
      symbol: "NZDUSD",
      name: "Kiwi / US Dollar",
      price: 0.61245,
      changePct: 0.18,
      recommendation: "BUY",
      confidence: 68,
      rsi: 56.4,
      targets: { entry: 0.61180, target1: 0.61850, target2: 0.62400, stopLoss: 0.60750 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "LOW",
      liquidityScore: 82,
      momentumScore: 62,
      probabilityScore: 65,
      marketRegime: "Risk-On Liquidity Drift",
      signalStrength: 68,
      status: "ACTIVE"
    },
    {
      symbol: "EURGBP",
      name: "Euro / Pound",
      price: 0.85642,
      changePct: -0.05,
      recommendation: "NEUTRAL",
      confidence: 50,
      rsi: 48.9,
      targets: { entry: 0.85600, target1: 0.86100, target2: 0.86450, stopLoss: 0.85250 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "LOW",
      liquidityScore: 85,
      momentumScore: 48,
      probabilityScore: 50,
      marketRegime: "Compressed Sideways Range",
      signalStrength: 50,
      status: "ACTIVE"
    },
    {
      symbol: "EURJPY",
      name: "Euro / Japanese Yen",
      price: 167.842,
      changePct: 0.28,
      recommendation: "BUY",
      confidence: 80,
      rsi: 59.8,
      targets: { entry: 167.650, target1: 168.950, target2: 169.500, stopLoss: 166.850 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "MEDIUM",
      liquidityScore: 92,
      momentumScore: 71,
      probabilityScore: 78,
      marketRegime: "Breakout Wave Accumulation",
      signalStrength: 80,
      status: "ACTIVE"
    },
    {
      symbol: "GBPJPY",
      name: "Pound / Japanese Yen",
      price: 195.424,
      changePct: 0.32,
      recommendation: "STRONG BUY",
      confidence: 88,
      rsi: 61.5,
      targets: { entry: 195.200, target1: 196.850, target2: 197.500, stopLoss: 194.350 },
      isVolatile: false,
      type: "FOREX",
      volatilityRating: "MEDIUM",
      liquidityScore: 93,
      momentumScore: 80,
      probabilityScore: 86,
      marketRegime: "Order Block Displacement",
      signalStrength: 88,
      status: "ACTIVE"
    }
  ].map(item => ({
    ...item,
    symbol: item.symbol.endsWith("m") ? item.symbol : `${item.symbol}m`,
    name: item.name.replace(" Spot", " CFD"),
    lastUpdatedTimestamp: Date.now()
  })) as MarqueeScanItem[];

  const triggerToast = (text: string, type: "success" | "info" | "error" | "warning" = "success") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const copySignal = (symbol: string, item: MarqueeScanItem) => {
    const directionShort = item.recommendation.includes("BUY")
      ? "BUY"
      : item.recommendation.includes("SELL")
      ? "SELL"
      : "NEUTRAL";

    const liveEntry = item.price || item.targets?.entry || 0;
    const entryStr = liveEntry ? formatValue(symbol, liveEntry) : "N/A";
    const tpStr = item.targets?.target1 ? formatValue(symbol, item.targets.target1) : "N/A";
    const slStr = item.targets?.stopLoss ? formatValue(symbol, item.targets.stopLoss) : "N/A";

    const rrRatio = item.targets && item.targets.target1 && liveEntry && item.targets.stopLoss && item.recommendation !== "NEUTRAL"
      ? `1:${(Math.abs(item.targets.target1 - liveEntry) / (Math.abs(liveEntry - item.targets.stopLoss) || 1)).toFixed(2)}`
      : "N/A";

    const now = new Date();
    const utcFormatted = now.toLocaleTimeString("en-US", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }) + " UTC";

    const textToCopy = `${symbol} | ${directionShort} (ACTIVE — EXECUTE NOW)
Entry (Live Market): ${entryStr} | TP: ${tpStr} | SL: ${slStr}
RR: ${rrRatio} | Confidence: ${item.confidence}%
${utcFormatted}`;

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        triggerToast(`Copied ${symbol} active payload ($${entryStr}) to clipboard.`, "success");
      })
      .catch(() => {
        triggerToast("Clipboard transfer failure.", "error");
      });
  };

  const toggleExpanded = (symbol: string) => {
    setExpandedCards((prev) => ({ ...prev, [symbol]: !prev[symbol] }));
  };

  useEffect(() => {
    setMarketScans(initialAssetFeed);

    const fetchMarketData = (category?: "crypto" | "forex") => {
      const endpoint = category ? `/api/market-scan?type=${category}` : "/api/market-scan";
      fetch(endpoint)
        .then((res) => {
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then((bulkData) => {
          if (Array.isArray(bulkData) && bulkData.length > 0) {
            setMarketScans((prevList) => {
              return prevList.map((item) => {
                const itemBaseSymbol = item.symbol.endsWith("m") ? item.symbol.slice(0, -1) : item.symbol;
                const matched = bulkData.find((b: any) => b.symbol.toUpperCase() === itemBaseSymbol.toUpperCase());
                if (matched) {
                  const priceDiff = matched.price - item.price;
                  if (Math.abs(priceDiff) > 0.000001) {
                    setTickStates((prev) => ({ ...prev, [item.symbol]: priceDiff > 0 ? "UP" : "DOWN" }));
                    setTimeout(() => {
                      setTickStates((prev) => ({ ...prev, [item.symbol]: null }));
                    }, 600);
                  }

                  return {
                    ...item,
                    price: matched.price,
                    changePct: matched.changePct,
                    recommendation: matched.recommendation || item.recommendation,
                    confidence: matched.confidence || item.confidence,
                    rsi: matched.rsi || item.rsi,
                    rsi15m: matched.rsi15m || matched.rsi || item.rsi15m,
                    rsi1h: matched.rsi1h || item.rsi1h,
                    rsi1d: matched.rsi1d || item.rsi1d,
                    atr: matched.atr || item.atr,
                    barsCount: matched.barsCount || item.barsCount,
                    macd: matched.macd || item.macd,
                    ema20: matched.ema20 || item.ema20,
                    ema50: matched.ema50 || item.ema50,
                    targets: matched.targets !== undefined ? matched.targets : item.targets,
                    marketStatus: matched.marketStatus || item.marketStatus,
                    indicatorsScan: matched.indicatorsScan || item.indicatorsScan,
                    keyLevelsCalc: matched.keyLevelsCalc || item.keyLevelsCalc,
                    dataSource: matched.dataSource || item.dataSource,
                    isStale: matched.isStale !== undefined ? matched.isStale : item.isStale,
                    staleReason: matched.staleReason || item.staleReason,
                    lastUpdated: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " UTC",
                    lastUpdatedTimestamp: Date.now()
                  };
                }
                return item;
              });
            });
          }
        })
        .catch(() => {});
    };

    fetchMarketData();
    const cryptoPollingTimer = setInterval(() => fetchMarketData("crypto"), 15000);
    const forexPollingTimer = setInterval(() => fetchMarketData("forex"), 30000);

    return () => {
      clearInterval(cryptoPollingTimer);
      clearInterval(forexPollingTimer);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 10 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const clockTimer = setInterval(() => {
      const now = new Date();
      setLiveUtcTime(now.toISOString().replace("T", " ").substring(0, 19) + " UTC");
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Fetch initial live signals from backend API store and localStorage
  useEffect(() => {
    let localSignals: AuditedSignalItem[] = [];
    try {
      const saved = localStorage.getItem("ai_studio_live_signals_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localSignals = parsed;
          setSignals(parsed);
        }
      }
    } catch (e) {}

    fetch("/api/signals")
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.signals) && data.signals.length > 0) {
          setSignals((prev) => {
            const base = prev.length > 0 ? prev : localSignals;
            const merged = data.signals.map((remote: AuditedSignalItem) => {
              const existing = base.find((l) => l.id === remote.id || l.symbol === remote.symbol);
              if (existing && existing.fireTimestamp) {
                return { ...remote, fireTimestamp: existing.fireTimestamp, timestamp: existing.timestamp || remote.timestamp };
              }
              return remote;
            });
            try {
              localStorage.setItem("ai_studio_live_signals_v2", JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Live signal push via SSE (server is source of truth) with a slow poll
  // fallback so the dashboard stays in sync even if SSE drops.
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    const applyServerSignals = (list: AuditedSignalItem[]) => {
      setSignals((prev) => {
        const merged = list.map((remote) => {
          const existing = prev.find((l) => l.id === remote.id);
          return existing ? { ...remote, ...existing } : remote;
        });
        return merged;
      });
    };

    const connect = () => {
      es = new EventSource("/api/events");
      es.addEventListener("signals", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data);
          if (Array.isArray(data?.signals)) applyServerSignals(data.signals);
        } catch {
          // ignore malformed SSE payloads
        }
      });
      es.onerror = () => {
        es?.close();
        if (!closed) setTimeout(connect, 5000); // reconnect with backoff
      };
    };
    connect();

    const poll = setInterval(() => {
      fetch("/api/signals")
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.signals) && data.signals.length > 0) {
            applyServerSignals(data.signals);
          }
        })
        .catch(() => {});
    }, 15000);

    return () => {
      closed = true;
      es?.close();
      clearInterval(poll);
    };
  }, []);

  // Synchronize Live Signals and Audit Log Engine in real-time
  useEffect(() => {
    if (!marketScans || marketScans.length === 0) return;

    setSignals((prevSignals) => {
      let updated = deduplicateSignals([...prevSignals]);
      let hasChanges = false;

      marketScans.forEach((item) => {
        if (!item.recommendation || item.recommendation === "NEUTRAL" || item.recommendation === "CLOSED") {
          return;
        }

        const sym = item.symbol;
        const livePrice = item.price;

        // Find existing ACTIVE signal for this symbol
        const existingIdx = updated.findIndex((s) => s.symbol === sym && (s.status === "ACTIVE" || !s.status));

        // Check if existing signal should be expired due to price drift
        if (existingIdx !== -1) {
          const existingSig = updated[existingIdx];
          const priceDrift = Math.abs(livePrice - existingSig.entryPrice);
          const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;

          // Calculate drift threshold based on asset type
          let driftThreshold = 0;
          if (["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym)) {
            driftThreshold = livePrice * 0.001; // 0.1% for crypto
          } else if (baseSym === "XAUUSD") {
            driftThreshold = 5; // $5 for gold
          } else {
            driftThreshold = baseSym.includes("JPY") ? 0.03 : 0.0003; // 3 pips / 3 pips
          }

          // Check for opposite signal (professional reversal detection)
          const hasOppositeSignal = (
            (existingSig.direction === "BUY" && item.recommendation.includes("SELL")) ||
            (existingSig.direction === "SELL" && item.recommendation.includes("BUY"))
          );

          // If price drifted significantly OR opposite signal detected, expire old signal
          if (priceDrift > driftThreshold || hasOppositeSignal) {
            const { pipsOrPoints, pnlPct } = calculateSanitizedPipsOrPoints(sym, existingSig.entryPrice, livePrice, existingSig.direction);
            updated[existingIdx] = {
              ...existingSig,
              result: "EXPIRED",
              status: "EXPIRED",
              resolvedAt: new Date().toISOString(),
              pipsOrPoints,
              pnlPct
            };
            // Remove from existingIdx since it's now expired
            updated.splice(existingIdx, 1);
          }
        }

        // Re-check for existing active signal after potential expiration
        const currentIdx = updated.findIndex((s) => s.symbol === sym && (s.status === "ACTIVE" || !s.status));

        if (currentIdx === -1) {
          // Check if pair state machine allows generating a new signal
          const check = canGenerateNewSignal(sym);
          const now = new Date();
          const utcTime = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";
          const nowIso = now.toISOString();

          if (check.allowed) {
            const isBuy = item.recommendation.includes("BUY");
            const dir: "BUY" | "SELL" = isBuy ? "BUY" : "SELL";
            const entryPrice = livePrice;

            const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
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

            const month = now.toISOString().substring(0, 7);
            const rr = Math.abs(tpPrice - entryPrice) / (Math.abs(entryPrice - slPrice) || 1);
            const sigId = `SIG-${sym.replace("m", "")}-${now.getTime().toString().slice(-5)}`;

            const newSig: AuditedSignalItem = {
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
              confidence: item.confidence
            };

            recordSignalGenerated(sym, sigId);
            updated.unshift(newSig);
            hasChanges = true;
          }
        } else {
          // Directional Commitment: Always use currentSig.direction (DO NOT FLIP)
          const currentSig = updated[existingIdx];
          const sigDir = currentSig.direction; // Strictly preserve committed direction!
          const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
          let newStatus: "ACTIVE" | "HIT TP" | "HIT SL" | "EXPIRED" = "ACTIVE";
          let exitPrice: number | undefined = undefined;

          // Calculate progress toward TP
          const tpDistance = Math.abs(currentSig.tpPrice - currentSig.entryPrice);
          const currentDistance = sigDir === "BUY" ? livePrice - currentSig.entryPrice : currentSig.entryPrice - livePrice;
          const progressPct = tpDistance > 0 ? Math.max(0, (currentDistance / tpDistance) * 100) : 0;

          // Check TP Hit
          if ((sigDir === "BUY" && livePrice >= currentSig.tpPrice) || (sigDir === "SELL" && livePrice <= currentSig.tpPrice)) {
            newStatus = "HIT TP";
            exitPrice = currentSig.tpPrice;
          }
          // Check Trailing Stop (activates when >50% toward TP)
          else if (progressPct >= 50) {
            const trailingStop = sigDir === "BUY"
              ? currentSig.entryPrice + (tpDistance * 0.5)
              : currentSig.entryPrice - (tpDistance * 0.5);
            if ((sigDir === "BUY" && livePrice <= trailingStop) || (sigDir === "SELL" && livePrice >= trailingStop)) {
              newStatus = "HIT SL"; // Trailing stop hit - secure profits!
              exitPrice = trailingStop;
            }
          }
          // Check SL Hit
          else if ((sigDir === "BUY" && livePrice <= currentSig.slPrice) || (sigDir === "SELL" && livePrice >= currentSig.slPrice)) {
            newStatus = "HIT SL";
            exitPrice = currentSig.slPrice;
          }
          // Check Time-based Expiry
          else {
            const birth = new Date(currentSig.createdAt || currentSig.fireTimestamp || currentSig.timestamp).getTime();
            // Market-aware age: count only *trading* seconds for FX/Gold so a
            // signal opened Friday evening isn't expired during the weekend close.

            const marketAge = calculateMarketAwareAge(baseSym, birth, new Date());
            const ageHours = marketAge.activeTradingSeconds / 3600;

            // Professional timeout rules:
            // 1. If 4+ trading hours and <25% progress toward TP, expire (signal lost momentum)
            // 2. If 8+ trading hours and <40% progress toward TP, expire
            // 3. Max 24 trading hours always
            const isStaleByTime = ageHours > 24;
            const isLostMomentum4h = ageHours >= 4 && progressPct < 25;
            const isLostMomentum8h = ageHours >= 8 && progressPct < 40;

            if (isStaleByTime || isLostMomentum4h || isLostMomentum8h) {
              newStatus = "EXPIRED";
              exitPrice = livePrice;
            }
          }

          if (newStatus !== "ACTIVE" && newStatus !== currentSig.status) {
            const { pipsOrPoints, pnlPct } = calculateSanitizedPipsOrPoints(
              sym,
              currentSig.entryPrice,
              exitPrice || livePrice,
              sigDir
            );

            const nowIso = new Date().toISOString();

            updated[existingIdx] = {
              ...currentSig,
              status: newStatus,
              result: newStatus as any,
              exitPrice,
              pnlPct,
              pipsOrPoints,
              updatedAt: nowIso,
              resolvedAt: nowIso,
              resultPips: pipsOrPoints
            };

            if (newStatus === "HIT TP" || newStatus === "HIT SL") {
              updatePairOnSignalClosed(sym, newStatus);
            }
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        try {
          localStorage.setItem("ai_studio_live_signals_v2", JSON.stringify(updated));
        } catch (e) {}
        fetch("/api/signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signals: updated })
        }).catch(() => {});
        return updated;
      }

      return prevSignals;
    });
  }, [marketScans]);

  // Monitor RR session transitions
  useEffect(() => {
    if (!liveUtcTime) return;
    const now = new Date();
    const newFlashes: Record<string, string> = {};
    const updatedPrevState: Record<string, { ratio: string; session: string }> = { ...prevRrState };

    marketScans.forEach((item) => {
      const baseSym = item.symbol.endsWith("m") ? item.symbol.slice(0, -1) : item.symbol;
      const prof = getAssetRRProfile(baseSym, now);
      const prev = prevRrState[baseSym];
      if (prev && (prev.ratio !== prof.rrString || prev.session !== prof.sessionName)) {
        newFlashes[baseSym] = `RR updated: ${prev.ratio} → ${prof.rrString} (${prof.sessionName})`;
        newFlashes[item.symbol] = `RR updated: ${prev.ratio} → ${prof.rrString} (${prof.sessionName})`;
      }
      updatedPrevState[baseSym] = { ratio: prof.rrString, session: prof.sessionName };
    });

    if (Object.keys(newFlashes).length > 0) {
      setRrFlashMap(prev => ({ ...prev, ...newFlashes }));
      const clearTimer = setTimeout(() => {
        setRrFlashMap({});
      }, 8000);
      return () => clearTimeout(clearTimer);
    }

    setPrevRrState(updatedPrevState);
  }, [liveUtcTime]);


  const getMarketConditions = (item: MarqueeScanItem) => {
    const sym = item.symbol;
    const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
    const isCrypto = ["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym);
    const isGold = baseSym === "XAUUSD";
    const isBuy = item.recommendation.toLowerCase().includes("buy");
    const isSell = item.recommendation.toLowerCase().includes("sell");

    let trendState = "EMA20 / EMA50 Neutral Alignment";
    if (item.ema20 && item.ema50) {
      if (item.ema20 > item.ema50) {
        trendState = `Bullish Alignment (20 EMA > 50 EMA)`;
      } else {
        trendState = `Bearish Alignment (20 EMA < 50 EMA)`;
      }
    }

    let volatility = "Low volatility (ATR compressed)";
    if (item.volatilityRating === "HIGH" || (item.atr && item.price && (item.atr / item.price > 0.008))) {
      volatility = "Elevated volatility regime (ATR expanding)";
    } else if (item.rsi > 65 || item.rsi < 35) {
      volatility = "Momentum acceleration (RSI extreme)";
    } else {
      volatility = "Moderate volatility regime";
    }

    // Retrieve support (S1) and resistance (R1) levels
    let rawS1 = item.keyLevelsCalc?.s1 ?? item.keyLevelsCalc?.recentLow;
    let rawR1 = item.keyLevelsCalc?.r1 ?? item.keyLevelsCalc?.recentHigh;

    if (rawS1 === undefined || rawR1 === undefined) {
      const targets = [item.targets?.stopLoss, item.targets?.target1, item.targets?.target2].filter(
        (v): v is number => typeof v === "number" && v > 0
      );
      const below = targets.filter(v => v < item.price);
      const above = targets.filter(v => v > item.price);

      rawS1 = below.length > 0 ? Math.max(...below) : item.price * 0.99;
      rawR1 = above.length > 0 ? Math.min(...above) : item.price * 1.01;
    }

    // STRICT GUARANTEE: Support (S1) MUST be below current price, Resistance (R1) MUST be above current price
    let s1Val = Math.min(rawS1, rawR1);
    let r1Val = Math.max(rawS1, rawR1);

    if (s1Val >= item.price) s1Val = item.price * 0.995;
    if (r1Val <= item.price) r1Val = item.price * 1.005;

    const s1Source = item.keyLevelsCalc?.s1Source || "24h Low";
    const r1Source = item.keyLevelsCalc?.r1Source || "24h High";

    const isCryptoOrGold = isCrypto || isGold;
    const fmtS1 = isCryptoOrGold ? `$${formatValue(sym, s1Val)}` : formatValue(sym, s1Val);
    const fmtR1 = isCryptoOrGold ? `$${formatValue(sym, r1Val)}` : formatValue(sym, r1Val);

    let keyLevels = `S1: ${fmtS1} (${s1Source}) | R1: ${fmtR1} (${r1Source})`;

    // Add S2 and R2 second levels if available
    if (item.keyLevelsCalc?.pivotS2 && item.keyLevelsCalc?.pivotR2) {
      const fmtS2 = isCryptoOrGold ? `$${formatValue(sym, item.keyLevelsCalc.pivotS2)}` : formatValue(sym, item.keyLevelsCalc.pivotS2);
      const fmtR2 = isCryptoOrGold ? `$${formatValue(sym, item.keyLevelsCalc.pivotR2)}` : formatValue(sym, item.keyLevelsCalc.pivotR2);
      keyLevels += ` | S2: ${fmtS2} | R2: ${fmtR2}`;
    }

    const utcHour = new Date().getUTCHours();
    let session = "";
    if (utcHour >= 0 && utcHour < 8) {
      session = "Asian session (00:00–08:00 UTC) — Consolidated volume";
    } else if (utcHour >= 7 && utcHour < 16) {
      session = "London session (07:00–16:00 UTC) — High liquidity";
    } else if (utcHour >= 13 && utcHour < 21) {
      session = "New York session (13:00–21:00 UTC) — Peak intraday volatility";
    } else {
      session = "Sydney/Pacific session (21:00–24:00 UTC) — Transition volume";
    }

    let correlationText = "DXY Index & Treasury Yield Macro Context";
    if (isCrypto) {
      const atrPct = (item.price && item.atr) ? ((item.atr / item.price) * 100).toFixed(2) : "0.50";
      const funding = `Spot Orderbook Feed (${session.split(" — ")[0]})`;
      const dominance = `Spot Feed: ${baseSym} / USDT`;
      const flow = `24h Change: ${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}% | 15m ATR Volatility: ${atrPct}% of price`;

      return { trendState, volatility, keyLevels, session, cryptoContext: { funding, dominance, flow }, isCrypto: true };
    } else {
      if (sym === "EURUSD" || sym === "GBPUSD") {
        correlationText = item.changePct >= 0 ? "DXY Index weakness providing upside tailwind" : "DXY Index strengthening applying downside pressure";
      } else if (sym === "USDJPY") {
        correlationText = "US Treasury 10-Yr yield rate differential driving USDJPY spot direction";
      } else if (sym === "XAUUSD") {
        correlationText = "Spot Gold rate reflecting macro inflation & yield expectations";
      }
      return { trendState, volatility, keyLevels, session, correlationText, isCrypto: false };
    }
  };

  const formatEmaSpread = (sym: string, ema20?: number, ema50?: number) => {
    if (ema20 === undefined || ema50 === undefined || ema20 === null || ema50 === null) return null;
    const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
    const diff = ema20 - ema50;
    const isCrypto = ["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym);
    const isGold = baseSym === "XAUUSD";

    if (isCrypto || isGold) {
      const formattedEma20 = `$${ema20.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const formattedEma50 = `$${ema50.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const sign = diff >= 0 ? "+" : "-";
      const formattedDiff = `$${Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return { ema20Str: formattedEma20, ema50Str: formattedEma50, spreadStr: `${sign}${formattedDiff}`, diff };
    } else {
      const isJPY = baseSym.includes("JPY");
      const digits = isJPY ? 3 : 5;
      const formattedEma20 = ema20.toFixed(digits);
      const formattedEma50 = ema50.toFixed(digits);
      const pips = isJPY ? diff * 100 : diff * 10000;
      const sign = pips >= 0 ? "+" : "";
      return { ema20Str: formattedEma20, ema50Str: formattedEma50, spreadStr: `${sign}${pips.toFixed(1)} Pips`, diff };
    }
  };

  const getAIReasoning = (item: MarqueeScanItem) => {
    const sym = item.symbol;
    const price = item.price;
    const ema20 = item.ema20;
    const ema50 = item.ema50;
    const rsi15m = item.rsi15m || item.rsi;
    const rsi1h = item.rsi1h;
    const atr = item.atr;
    const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
    const isCrypto = ["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym);
    const isGold = baseSym === "XAUUSD";

    let emaText = "";
    if (ema20 && ema50) {
      const fmtEma20 = (isCrypto || isGold) ? `$${formatValue(sym, ema20)}` : formatValue(sym, ema20);
      const fmtEma50 = (isCrypto || isGold) ? `$${formatValue(sym, ema50)}` : formatValue(sym, ema50);
      if (price < ema20 && price < ema50) {
        emaText = `Price is below 20-period EMA (${fmtEma20}) and 50-period EMA (${fmtEma50}). Bearish trend alignment.`;
      } else if (price > ema20 && price > ema50) {
        emaText = `Price is above 20-period EMA (${fmtEma20}) and 50-period EMA (${fmtEma50}). Bullish trend alignment.`;
      } else {
        emaText = `Price at ${formatValue(sym, price)}, sitting between 20 EMA (${fmtEma20}) and 50 EMA (${fmtEma50}).`;
      }
    } else {
      emaText = `Price at ${formatValue(sym, price)}.`;
    }

    const rsiStatusStr = rsi15m < 35 ? "Oversold" : rsi15m > 65 ? "Overbought" : "Neutral";
    const rsiText = `RSI at ${rsi15m.toFixed(1)} on 15m timeframe (${rsiStatusStr})${rsi1h ? ` and ${rsi1h.toFixed(1)} on 1h timeframe` : ""}.`;

    const atrValStr = atr
      ? ((isCrypto || isGold) ? `$${atr.toFixed(2)}` : `${(atr * 10000).toFixed(1)} pips`)
      : "N/A";

    const volRegime = (atr && price && (atr / price > 0.008))
      ? "High volatility regime."
      : "Moderate volatility regime.";

    const atrText = `ATR at ${atrValStr} — ${volRegime}`;

    return `${emaText} ${rsiText} ${atrText}`;
  };

  const filteredFeed = marketScans.filter((item) => {
    if (!searchQuery || searchQuery.trim() === "") return true;
    const cleanQuery = searchQuery.trim().toLowerCase();
    return (
      item.symbol.toLowerCase().includes(cleanQuery) ||
      item.name.toLowerCase().includes(cleanQuery)
    );
  });

  // --- Derived KPI stats (drives the professional terminal strip) ---
  const marketsOpen = marketScans.filter((i) => getMarketStatus(i.symbol.endsWith("m") ? i.symbol.slice(0, -1) : i.symbol, new Date()).isOpen).length;
  const activeSignalCount = signals.filter((s) => s.status === "ACTIVE" || !s.status).length;
  const withConf = marketScans.filter((i) => i.confidence > 0);
  const avgConfidence = withConf.length ? Math.round(withConf.reduce((a, i) => a + i.confidence, 0) / withConf.length) : 0;
  const topMover = marketScans.slice().sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0] || null;

return (
    <div className="space-y-5 animate-fade-in text-slate-100 font-sans pb-16 max-w-[1200px] mx-auto" id="chamber-bloomberg-dashboard-root">

      {/* Toast Notifications Stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full" id="toast-mount-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start justify-between gap-3 p-3.5 rounded-lg border shadow-lg backdrop-blur-md animate-fade-in text-xs font-sans ${
              t.type === "success" ? "bg-[#0b1526] border-emerald-500/50 text-slate-100 border-l-4 border-l-emerald-500" :
              t.type === "error" ? "bg-[#0b1526] border-rose-500/50 text-slate-100 border-l-4 border-l-rose-500" :
              t.type === "warning" ? "bg-[#0b1526] border-amber-500/50 text-slate-100 border-l-4 border-l-amber-500" :
              "bg-[#0b1526] border-slate-700 text-slate-100 border-l-4 border-l-amber-500"
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="font-medium">{t.text}</span>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-slate-400 hover:text-slate-200 transition shrink-0 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* HEADER — brand, live status, clock, search */}
      <header className="terminal-panel rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 relative z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-950/30">
              <Vault className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 className="font-display text-base md:text-lg font-extrabold tracking-[0.18em] text-slate-50 leading-none">
                CHAMBER<span className="text-amber-400">FX</span>
              </h1>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">Quantitative Signal Terminal</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live market status pill */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-[#0a1220] border border-slate-700/60 rounded-full px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-live-pulse" />
            <span className="uppercase tracking-wider font-semibold">Live</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{marketsOpen} markets open</span>
          </div>

          {searchExpanded ? (
            <div className="relative flex items-center">
              <input
                type="text"
                autoFocus
                className="bg-[#0a1220] text-slate-100 pl-8 pr-8 py-1.5 rounded-lg border border-amber-500/70 focus:outline-none text-xs font-mono w-48 sm:w-64 transition-all placeholder-slate-500"
                placeholder="Search pairs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
              <button
                onClick={() => { setSearchQuery(""); setSearchExpanded(false); }}
                className="absolute right-2 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Close search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchExpanded(true)}
              className="p-2 text-slate-400 hover:text-slate-200 transition cursor-pointer rounded-lg hover:bg-slate-800/70 flex items-center gap-1.5 text-xs font-mono"
              title="Search pairs"
            >
              <Search className="h-4 w-4" />
              {searchQuery && <span className="text-amber-400 font-bold">({searchQuery})</span>}
            </button>
          )}

          <div className="text-xs text-slate-400 font-mono font-medium tabular-nums shrink-0 hidden md:block">
            {liveUtcTime ? (liveUtcTime.includes(" ") ? liveUtcTime.split(" ")[1].substring(0, 5) + " UTC" : liveUtcTime) : "11:22 UTC"}
          </div>
        </div>
      </header>

      {/* KPI STRIP — live derived stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3" id="kpi-strip">
        <div className="terminal-panel terminal-panel-hover rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <Activity className="h-3.5 w-3.5 text-amber-400" />
            Markets Open
          </div>
          <div className="mt-1.5 text-2xl font-display font-bold text-slate-50 tabular-nums">
            {marketsOpen}<span className="text-sm text-slate-500 ml-1 font-mono">/ {marketScans.length}</span>
          </div>
        </div>

        <div className="terminal-panel terminal-panel-hover rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Active Signals
          </div>
          <div className="mt-1.5 text-2xl font-display font-bold text-slate-50 tabular-nums">
            {activeSignalCount}
          </div>
        </div>

        <div className="terminal-panel terminal-panel-hover rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
            Avg Confidence
          </div>
          <div className="mt-1.5 text-2xl font-display font-bold text-slate-50 tabular-nums">
            {avgConfidence}<span className="text-sm text-slate-500 ml-1 font-mono">%</span>
          </div>
        </div>

        <div className="terminal-panel terminal-panel-hover rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
            Top Mover
          </div>
          <div className="mt-1.5 text-xl font-display font-bold text-slate-50 tabular-nums truncate">
            {topMover ? (
              <span className={topMover.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {topMover.symbol.replace("m", "")} {topMover.changePct >= 0 ? "▲" : "▼"} {Math.abs(topMover.changePct).toFixed(2)}%
              </span>
            ) : (
              <span className="text-slate-500 text-sm">—</span>
            )}
          </div>
        </div>
      </section>
{/* SIGNAL FEED */}
      <section className="w-full space-y-3" id="section-signal-feed">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Signal Feed</h2>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{filteredFeed.length} pairs</span>
        </div>

        {filteredFeed.length === 0 ? (
          <div className="p-10 text-center terminal-panel rounded-xl space-y-2">
            <Compass className="h-8 w-8 text-slate-600 mx-auto" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest block font-medium">No active signals match search filter.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredFeed.map((item) => {
              const sym = item.symbol;
              const baseSym = sym.endsWith("m") ? sym.slice(0, -1) : sym;
              const mStatus = item.marketStatus || getMarketStatus(baseSym, new Date());
              const isCryptoOrGold = baseSym === "XAUUSD" || ["BTCUSD", "ETHUSD", "SOLUSD"].includes(baseSym);
              const isBuy = item.recommendation.includes("BUY");
              const isSell = item.recommendation.includes("SELL");

              let progressPct = 0;
              let progressLabel = "0% to TP";
              let progressColor = "bg-slate-500";
              if (item.targets?.entry && item.targets?.target1) {
                const entry = item.targets.entry;
                const tp = item.targets.target1;
                const price = item.price;
                const tpDist = Math.abs(tp - entry);
                const priceProgress = isBuy ? price - entry : entry - price;
                progressPct = tpDist > 0 ? (priceProgress / tpDist) * 100 : 0;
                if (progressPct >= 100) {
                  progressLabel = "TP HIT";
                  progressColor = "bg-emerald-400";
                } else if (progressPct >= 50) {
                  progressLabel = `${progressPct.toFixed(0)}% to TP · trailing`;
                  progressColor = "bg-amber-400";
                } else if (progressPct > 0) {
                  progressLabel = `${progressPct.toFixed(0)}% to TP`;
                  progressColor = "bg-sky-400";
                } else {
                  progressLabel = `${Math.abs(progressPct).toFixed(0)}% below entry`;
                  progressColor = "bg-rose-400";
                }
              }
              const isExpanded = !!expandedCards[sym];
              const tickDir = tickStates[sym];
              const staleInfo = calculateIsStale(item);
              const marketAge = calculateMarketAwareAge(baseSym, item.lastUpdatedTimestamp || Date.now());
              const cardActiveSig = signals.find((s) => s.symbol === sym && (s.status === "ACTIVE" || !s.status));
              const cardSignalAgeStr = cardActiveSig?.fireTimestamp
                ? getSignalAgeString(cardActiveSig.fireTimestamp)
                : marketAge.formattedAge;

              const signalStartMs = cardActiveSig?.createdAt
                ? new Date(cardActiveSig.createdAt).getTime()
                : (cardActiveSig?.fireTimestamp
                  ? new Date(cardActiveSig.fireTimestamp).getTime()
                  : (item.lastUpdatedTimestamp || Date.now()));
              const marketAgeCard = calculateMarketAwareAge(baseSym, signalStartMs || Date.now(), new Date());
              const ageHours = marketAgeCard.activeTradingSeconds / 3600;
              const isOver4Hours = ageHours > 4 && ageHours <= 24;
              const isExpired = ageHours > 24 || cardActiveSig?.status === "EXPIRED";
              const currentStatus = isExpired ? "EXPIRED" : (!mStatus.isOpen ? "CLOSED" : (staleInfo.isStale ? "RECALCULATING" : "ACTIVE"));

              const emaTrendStr = item.ema20 && item.ema50 ? (item.ema20 > item.ema50 ? "Bullish" : "Bearish") : "Neutral";
              const rsiValStr = (item.rsi15m || item.rsi || 50).toFixed(1);
              const atrValStr = item.atr ? (isCryptoOrGold ? `$${item.atr.toFixed(2)}` : `${(item.atr * 10000).toFixed(1)} Pips`) : "N/A";

              const isPriceUp = item.changePct >= 0;
              const rrProf = getAssetRRProfile(baseSym, new Date());
              const isNeutralSignal = item.recommendation.includes("NEUTRAL") || !item.targets?.entry || item.targets.entry === 0;

              // Status chip
              const statusChip = !mStatus.isOpen
                ? { text: "Closed", cls: "bg-slate-700/60 text-slate-300" }
                : currentStatus === "RECALCULATING"
                ? { text: "Recalculating", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30" }
                : currentStatus === "EXPIRED"
                ? { text: "Expired", cls: "bg-rose-500/15 text-rose-300 border border-rose-500/30" }
                : { text: "Active", cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" };

              return (
                <div
                  key={sym}
                  className={`terminal-panel terminal-panel-hover rounded-xl p-4 md:p-5 flex flex-col justify-between gap-3 relative ${!mStatus.isOpen ? "opacity-70" : ""}`}
                >
                  {/* Row 1: name, status, badge, RR */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-display font-bold text-[15px] md:text-base text-slate-50 truncate">
                        {getCleanLabel(sym).split(" (")[0]}
                      </span>
                      <span className="text-[11px] text-slate-500 uppercase font-mono">{sym.replace("m", "")}</span>
                      <span className={`hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full ${statusChip.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${currentStatus === "ACTIVE" && mStatus.isOpen ? "bg-emerald-400 animate-live-pulse" : "bg-current"}`} />
                        {statusChip.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(() => {
                        let badgeClass = "bg-slate-700/60 text-slate-200";
                        let badgeLabel = "NEUTRAL";
                        if (!mStatus.isOpen) {
                          badgeClass = "bg-slate-700/60 text-slate-400";
                          badgeLabel = "CLOSED";
                        } else if (item.recommendation.includes("STRONG BUY")) {
                          badgeClass = "bg-emerald-600 text-white";
                          badgeLabel = "BUY";
                        } else if (item.recommendation.includes("BUY")) {
                          badgeClass = "bg-emerald-500 text-white";
                          badgeLabel = "BUY";
                        } else if (item.recommendation.includes("STRONG SELL")) {
                          badgeClass = "bg-rose-600 text-white";
                          badgeLabel = "SELL";
                        } else if (item.recommendation.includes("SELL")) {
                          badgeClass = "bg-rose-500 text-white";
                          badgeLabel = "SELL";
                        }
                        return (
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                        );
                      })()}
                      <span className="text-[11px] font-mono font-bold px-2 py-1 bg-slate-900 text-amber-400 border border-slate-700/70 rounded-md">
                        {rrProf.rrString}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: price & change | confidence */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2.5">
                      <span className={`text-xl md:text-2xl font-mono font-bold tracking-tight text-slate-50 tabular-nums transition duration-150 ${
                        tickDir === "UP" ? "text-emerald-300" : tickDir === "DOWN" ? "text-rose-300" : ""
                      }`}>
                        {isCryptoOrGold ? "$" : ""}{formatValue(sym, item.price)}
                      </span>
                      <span className={`text-xs font-mono font-bold tabular-nums ${isPriceUp ? "text-emerald-400" : "text-rose-400"}`}>
                        {isPriceUp ? "▲ +" : "▼ "}{item.changePct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <span className="text-xs md:text-sm font-mono font-semibold text-amber-400 tabular-nums">
                        {!mStatus.isOpen ? "0" : `${item.confidence}`}
                        <span className="text-[10px] text-slate-500 font-medium ml-1 uppercase">conf</span>
                      </span>
                      <div className="w-24 sm:w-32 bg-[#0a1220] h-1 rounded-full overflow-hidden border border-slate-700/40">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-300"
                          style={{ width: `${!mStatus.isOpen ? 0 : item.confidence}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 3: targets or standby */}
                  {isNeutralSignal ? (
                    <div className="bg-[#0a1220] border border-slate-800 rounded-lg py-3 px-4 text-center font-mono">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Market Standby — No Active Signal
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 font-mono">
                      <div className="bg-[#0a1220] border border-slate-800 rounded-lg py-2.5 px-2 text-center">
                        <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider block mb-0.5">Entry</span>
                        <span className="text-sm font-semibold text-slate-100 block truncate">
                          {`${isCryptoOrGold ? "$" : ""}${formatValue(sym, item.targets!.entry)}`}
                        </span>
                      </div>
                      <div className="bg-[#06281e] border border-emerald-800/50 rounded-lg py-2.5 px-2 text-center">
                        <span className="text-[9px] font-medium text-emerald-400/80 uppercase tracking-wider block mb-0.5">TP1</span>
                        <span className="text-sm font-semibold text-emerald-300 block truncate">
                          {item.targets?.target1 ? `${isCryptoOrGold ? "$" : ""}${formatValue(sym, item.targets.target1)}` : "—"}
                        </span>
                      </div>
                      <div className="bg-[#320a16] border border-rose-900/50 rounded-lg py-2.5 px-2 text-center">
                        <span className="text-[9px] font-medium text-rose-400/80 uppercase tracking-wider block mb-0.5">SL</span>
                        <span className="text-sm font-semibold text-rose-300 block truncate">
                          {item.targets?.stopLoss ? `${isCryptoOrGold ? "$" : ""}${formatValue(sym, item.targets.stopLoss)}` : "—"}
                        </span>
                      </div>
                      <div className="hidden sm:block bg-[#131d2e] border border-slate-800 rounded-lg py-2.5 px-2 text-center">
                        <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider block mb-0.5">Signal</span>
                        <span className="text-sm font-semibold text-slate-100 block truncate">
                          {emaTrendStr} · RSI {rsiValStr}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Progress to TP */}
                  {item.targets && item.targets.entry && item.targets.target1 && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                        <span className={progressColor === "bg-rose-400" ? "text-rose-400" : progressColor === "bg-amber-400" ? "text-amber-400" : "text-sky-400"}>
                          {progressLabel}
                        </span>
                        <span>{item.targets.rrProfile?.rrString || "1:2.0"}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                        <div className={`h-full ${progressColor} transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Row 4: footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-slate-400 pt-2 border-t border-slate-800/70">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{isExpired ? "24h+ ago" : cardSignalAgeStr}</span>
                      <span className="text-slate-600">·</span>
                      {currentStatus === "ACTIVE" && isOver4Hours && (
                        <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">Long Duration</span>
                      )}
                      {!isExpanded && (
                        <span className="hidden md:inline text-slate-500">
                          {emaTrendStr} · RSI {rsiValStr} · ATR {atrValStr}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        onClick={() => toggleExpanded(sym)}
                        className="px-2.5 py-1.5 text-slate-300 hover:text-slate-100 bg-slate-900 border border-slate-700/70 hover:border-slate-600 text-[11px] font-mono font-medium rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <span>Analysis</span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => copySignal(sym, item)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-[11px] rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                      >
                        <Copy className="h-3 w-3" />
                        <span>COPY</span>
                      </button>
                    </div>
                  </div>

                  {/* Expandable analysis drawer */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-slate-800 font-mono text-xs text-slate-200 space-y-2.5 animate-fade-up bg-[#0a1220] p-3.5 rounded-lg border border-slate-800">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-[#131d2e] p-2.5 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase font-medium">ATR</span>
                          <span className="font-bold text-amber-400 text-xs">{atrValStr}</span>
                        </div>
                        <div className="bg-[#131d2e] p-2.5 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase font-medium">RSI(15M)</span>
                          <span className="font-bold text-sky-400 text-xs">{rsiValStr}</span>
                        </div>
                        <div className="bg-[#131d2e] p-2.5 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase font-medium">MACD</span>
                          <span className={`font-bold text-xs ${item.macd && item.macd.histogram > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {item.macd ? (item.macd.histogram > 0 ? `+${item.macd.histogram.toFixed(2)}` : item.macd.histogram.toFixed(2)) : "0.00"}
                          </span>
                        </div>
                        <div className="bg-[#131d2e] p-2.5 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase font-medium">EMA Trend</span>
                          <span className={`font-bold text-xs ${item.ema20 && item.ema50 && item.ema20 > item.ema50 ? "text-emerald-400" : "text-amber-400"}`}>
                            {item.ema20 && item.ema50 ? (item.ema20 > item.ema50 ? "Bullish" : "Bearish") : "Neutral"}
                          </span>
                        </div>
                      </div>

                      {item.indicatorsScan && (
                        <div className="flex items-center gap-3 pt-2 border-t border-slate-800/80 text-[10px]">
                          <span className="uppercase text-slate-500">Signals:</span>
                          <span className="text-emerald-400 font-bold">{item.indicatorsScan.bullishIndicators || 0} bull</span>
                          <span className="text-slate-700">|</span>
                          <span className="text-rose-400 font-bold">{item.indicatorsScan.bearishIndicators || 0} bear</span>
                          {item.indicatorsScan.rsiStatus && (<>
                            <span className="text-slate-700">|</span>
                            <span className={item.indicatorsScan.rsiStatus.includes('OVERBOUGHT') ? 'text-rose-400' : item.indicatorsScan.rsiStatus.includes('OVERSOLD') ? 'text-emerald-400' : 'text-slate-400'}>
                              RSI {item.indicatorsScan.rsiStatus}
                            </span>
                          </>)}
                          {item.indicatorsScan.macdStatus && (<>
                            <span className="text-slate-700">|</span>
                            <span className={item.indicatorsScan.macdStatus === 'BULLISH' ? 'text-emerald-400' : item.indicatorsScan.macdStatus === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}>
                              MACD {item.indicatorsScan.macdStatus}
                            </span>
                          </>)}
                        </div>
                      )}

                      {item.ema20 && item.ema50 && (
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-300 pt-2 border-t border-slate-800 gap-2 font-mono">
                          <span>EMA20 <strong className="text-slate-100 font-bold">{formatEmaSpread(sym, item.ema20, item.ema50)?.ema20Str}</strong></span>
                          <span>EMA50 <strong className="text-slate-100 font-bold">{formatEmaSpread(sym, item.ema20, item.ema50)?.ema50Str}</strong></span>
                          <span>Spread <strong className={item.ema20 >= item.ema50 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{formatEmaSpread(sym, item.ema20, item.ema50)?.spreadStr}</strong></span>
                        </div>
                      )}

                      <div className="text-xs font-sans text-slate-300 pt-2 border-t border-slate-800 leading-relaxed font-medium">
                        {getAIReasoning(item)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}