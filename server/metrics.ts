// Minimal Prometheus text-format metrics (no deps). Export a plain-text
// exposition that Prometheus can scrape from /metrics.

const registry = new Map<string, { help: string; type: string; values: Map<string, number> }>();

function increment(name: string, help: string, labels: Record<string, string | number> = {}, by = 1) {
  const key = Object.entries(labels)
    .map(([k, v]) => `${k}="${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
  const labelStr = key ? `{${key}}` : "";
  if (!registry.has(name)) registry.set(name, { help, type: "counter", values: new Map() });
  const entry = registry.get(name)!;
  entry.values.set(labelStr, (entry.values.get(labelStr) || 0) + by);
}

function setGauge(name: string, help: string, value: number, labels: Record<string, string | number> = {}) {
  const key = Object.entries(labels)
    .map(([k, v]) => `${k}="${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
  const labelStr = key ? `{${key}}` : "";
  if (!registry.has(name)) registry.set(name, { help, type: "gauge", values: new Map() });
  registry.get(name)!.values.set(labelStr, value);
}

export function observeHttp(method: string, path: string, status: number, durationMs: number) {
  increment("http_requests_total", "Total HTTP requests", { method, path, status });
  increment("http_request_duration_ms", "HTTP request duration in milliseconds", { method, path }, durationMs);
}

export function countSignalEvent(kind: "generated" | "expired" | "closed", symbol = "unknown") {
  increment("signal_events_total", "Signal lifecycle events", { kind, symbol });
}

export function observeReconciler(scanned: number, active: number, ok: boolean) {
  setGauge("reconciler_scanned_assets", "Assets scanned in last reconciler pass", scanned);
  setGauge("reconciler_active_signals", "Active signals in store", active);
  setGauge("reconciler_last_pass_ok", "Whether the last reconciler pass succeeded", ok ? 1 : 0);
}

export function observeEngineHealth(reachable: boolean, modelVersion?: string) {
  setGauge("engine_reachable", "Whether the Python engine service is reachable", reachable ? 1 : 0);
  if (modelVersion) setGauge("engine_model_version_info", "Trained model version", 1, { version: modelVersion });
}

export function renderMetrics(): string {
  const lines: string[] = [];
  for (const [name, entry] of registry) {
    lines.push(`# HELP ${name} ${entry.help}`);
    lines.push(`# TYPE ${name} ${entry.type}`);
    for (const [labels, value] of entry.values) {
      lines.push(`${name}${labels} ${value}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function resetMetricsForTests() {
  registry.clear();
}