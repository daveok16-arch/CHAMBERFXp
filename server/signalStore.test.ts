import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { ServerSignal } from "../src/shared/signal";

// Use an isolated data dir for store tests.
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chamberfx-store-"));

// The store module reads DATA_DIR from process.cwd(). Swap cwd so tests don't
// pollute dev data, then restore.
const realCwd = process.cwd();

function makeSig(id: string): ServerSignal {
  const now = new Date().toISOString();
  return {
    id,
    timestamp: now,
    month: now.substring(0, 7),
    symbol: "BTCUSD",
    direction: "BUY",
    entryPrice: 65000,
    tpPrice: 66000,
    slPrice: 64000,
    result: "ACTIVE",
    status: "ACTIVE",
    pipsOrPoints: 0,
    pnlPct: 0,
    rrAchieved: 2,
    priceAtFire: 65000,
    fireTimestamp: now,
  };
}

describe("store persistence (JSON backend)", () => {
  before(() => {
    process.env.DATABASE_URL = ""; // force JSON backend
    fs.mkdirSync(path.join(TEST_DATA_DIR, "data"), { recursive: true });
    process.chdir(TEST_DATA_DIR);
  });
  after(() => {
    delete process.env.DATABASE_URL;
    process.chdir(realCwd);
  });

  test("initStore, write + read back durable JSON", async () => {
    const store: any = await import("./store");
    await store.initStore();
    await store.clearSignals();
    await store.upsertSignal(makeSig("sig-a"));
    await store.upsertSignal(makeSig("sig-b"));
    const loaded = await store.getSignals();
    assert.equal(loaded.length, 2);
    assert.ok(loaded.some((s) => s.id === "sig-a"));
    assert.ok(loaded.some((s) => s.id === "sig-b"));

    // File exists and is valid JSON.
    const file = path.join(TEST_DATA_DIR, "data", "signals.json");
    assert.ok(fs.existsSync(file));
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    assert.equal(parsed.length, 2);

    await store.clearSignals();
  });

  test("replaceSignals + clearSignals", async () => {
    const store: any = await import("./store");
    await store.replaceSignals([makeSig("x"), makeSig("y")]);
    assert.equal((await store.getSignals()).length, 2);
    await store.clearSignals();
    assert.equal((await store.getSignals()).length, 0);
  });
});