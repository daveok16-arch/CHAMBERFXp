// Structured JSON-lines logger with request context. Keeps the console output
// machine-parseable (Promtail/Fluentd/etc.) while remaining human-readable.

type Level = "info" | "warn" | "error" | "debug";

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
};

export function requestLogFields(method: string, path: string, status: number, durationMs: number, requestId?: string) {
  return { method, path, status, durationMs, requestId };
}