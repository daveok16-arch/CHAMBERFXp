import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { observeHttp, countSignalEvent, observeReconciler, renderMetrics, resetMetricsForTests } from "./metrics";

describe("metrics", () => {
  test("observeHttp records counters and renders prometheus text", () => {
    resetMetricsForTests();
    observeHttp("GET", "/api/signals", 200, 12);
    observeHttp("GET", "/api/signals", 200, 8);
    observeHttp("POST", "/api/signals", 401, 3);
    const out = renderMetrics();
    assert.match(out, /http_requests_total/);
    assert.match(out, /http_request_duration_ms/);
    assert.match(out, /http_requests_total\{method="GET",path="\/api\/signals",status="200"\} 2/);
    assert.match(out, /# TYPE http_requests_total counter/);
  });

  test("signal events and reconciler gauges render", () => {
    resetMetricsForTests();
    countSignalEvent("generated", "BTCUSD");
    countSignalEvent("expired");
    observeReconciler(19, 3, true);
    const out = renderMetrics();
    assert.match(out, /signal_events_total\{kind="generated",symbol="BTCUSD"\} 1/);
    assert.match(out, /signal_events_total\{kind="expired",symbol="unknown"\} 1/);
    assert.match(out, /reconciler_scanned_assets 19/);
    assert.match(out, /reconciler_active_signals 3/);
    assert.match(out, /reconciler_last_pass_ok 1/);
  });
});