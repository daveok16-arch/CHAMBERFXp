import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileSignals,
  deduplicateSignals,
  calculateSanitizedPipsOrPoints,
  canGenerateNewSignal,
  getPairState,
  __resetPairStateForTests,
} from "./signalEngine";
import { ServerSignal, ScanSnapshot } from "../src/shared/signal";

function makeSig(symbol: string, id: string, direction: "BUY" | "SELL" = "BUY", price = 100, status: ServerSignal["status"] = "ACTIVE"): ServerSignal {
  const now = new Date().toISOString();
  return {
    id,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resultPips: null,
    month: now.substring(0, 7),
    symbol,
    direction,
    entryPrice: price,
    tpPrice: price * 1.02,
    slPrice: price * 0.99,
    result: status === "ACTIVE" ? "ACTIVE" : status.toUpperCase() as ServerSignal["result"],
    status,
    pipsOrPoints: 0,
    pnlPct: 0,
    rrAchieved: 2,
    priceAtFire: price,
    fireTimestamp: now,
  };
}

function makeScan(symbol: string, rec: string, price: number, atr = 1): ScanSnapshot {
  return {
    symbol,
    price,
    changePct: 0,
    recommendation: rec,
    confidence: 80,
    rsi: 55,
    atr,
    marketStatus: { isOpen: true, statusText: "OPEN" },
  };
}

describe("reconcileSignals", () => {
  test("generates a signal when none active and scan is bullish", () => {
    const r = reconcileSignals([], [makeScan("BTCUSD", "BUY", 65000, 500)]);
    assert.equal(r.generated, 1);
    assert.equal(r.signals.length, 1);
    assert.equal(r.signals[0].symbol, "BTCUSD");
    assert.equal(r.signals[0].direction, "BUY");
  });

  test("skips neutral and closed scans", () => {
    const r = reconcileSignals([], [makeScan("EURUSD", "NEUTRAL", 1.08, 0.001), makeScan("GBPUSD", "CLOSED", 1.27, 0.001)]);
    assert.equal(r.generated, 0);
  });

  test("expires by opposite signal", () => {
    const sig = makeSig("BTCUSD", "s1", "BUY", 65000);
    const r = reconcileSignals([sig], [makeScan("BTCUSD", "SELL", 65000)]);
    assert.equal(r.expired, 1);
    assert.ok(r.signals.every((s) => s.status !== "ACTIVE"));
  });

  test("expires by price drift on crypto", () => {
    const sig = makeSig("BTCUSD", "s1", "BUY", 65000);
    // 0.2% drift exceeds 0.1% crypto threshold
    const r = reconcileSignals([sig], [makeScan("BTCUSD", "BUY", 65130)]);
    assert.equal(r.expired, 1);
  });

  test("does not expire small drift", () => {
    const sig = makeSig("BTCUSD", "s1", "BUY", 65000);
    const r = reconcileSignals([sig], [makeScan("BTCUSD", "BUY", 65010)]);
    assert.equal(r.expired, 0);
    assert.ok(r.signals.find((s) => s.id === "s1"));
  });

  test("closes at TP hit when price reaches tp within drift threshold", () => {
    // Narrow gain so TP is reachable within the 0.1% crypto drift threshold:
    // entry 2000, price 2012 is +0.6% -> would EXPIRE via drift first, so use
    // tight tp on a forex pair (drift threshold 0.0003 = 3 pips for EURUSD).
    const sig = makeSig("EURUSD", "s1", "BUY", 1.1000);
    const sig2 = { ...sig, tpPrice: 1.1005, slPrice: 1.0995 };
    const r = reconcileSignals([sig2], [makeScan("EURUSD", "BUY", 1.1005, 0.001)]);
    const closed = r.signals.find((s) => s.id === "s1");
    // price moved +5 pips: within drift (3 pips)? 5 pips > 3 pips -> EXPIRED via drift.
    // Choose a case inside drift: tp at +1 pip.
    const sig3 = { ...sig, tpPrice: 1.1001, slPrice: 1.0995 };
    const r2 = reconcileSignals([sig3], [makeScan("EURUSD", "BUY", 1.1001, 0.001)]);
    const closed2 = r2.signals.find((s) => s.id === "s1");
    assert.equal(r2.closed, 1);
    assert.equal(closed2?.status, "HIT TP");
  });
});

describe("deduplicateSignals", () => {
  test("removes duplicate ids", () => {
    const sig = makeSig("BTCUSD", "s1");
    // Give s2 a distinct fire timestamp so only id dedup applies
    const sig2 = { ...sig, id: "s2", fireTimestamp: new Date(Date.now() + 60000).toISOString(), timestamp: new Date(Date.now() + 60000).toISOString() };
    const r = deduplicateSignals([sig, { ...sig }, sig2]);
    assert.equal(r.length, 2);
  });
});

describe("calculateSanitizedPipsOrPoints", () => {
  test("crypto pips = price diff clamped", () => {
    const r = calculateSanitizedPipsOrPoints("BTCUSD", 65000, 65100, "BUY");
    assert.equal(r.pipsOrPoints, 100);
    assert.ok(r.pnlPct > 0);
  });

  test("forex pips = diff * 10000", () => {
    const r = calculateSanitizedPipsOrPoints("EURUSD", 1.1, 1.1001, "BUY");
    assert.equal(r.pipsOrPoints, 1);
  });

  test("jpy pips = diff * 100", () => {
    const r = calculateSanitizedPipsOrPoints("USDJPY", 155, 155.02, "BUY");
    assert.equal(r.pipsOrPoints, 2);
  });
});

describe("pair state", () => {
  test("canGenerateNewSignal: first is allowed, then too many locks", () => {
    __resetPairStateForTests();
    const first = canGenerateNewSignal("EURUSD");
    assert.ok(first.allowed);
    getPairState("EURUSD").hourlyTimestamps.push(Date.now(), Date.now() + 1000);
    const locked = canGenerateNewSignal("EURUSD");
    assert.equal(locked.allowed, false);
  });
});