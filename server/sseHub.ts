// Server-Sent Events hub: broadcast signal updates to connected dashboards.
// Client reconnects automatically; events are best-effort (durable store is
// the source of truth, SSE is just a fast-path notification).
import { Response } from "express";

let clients = new Set<Response>();

export function sseConnect(req: any, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  clients.add(res);
  req.on("close", () => {
    clients.delete(res);
  });

  // heartbeat every 25s to keep the connection alive through proxies
  const hb = setInterval(() => {
    res.write(": hb\n\n");
  }, 25000);
  res.on("close", () => clearInterval(hb));
}

export function broadcastSignals(signals: unknown[], generated: number, closed: number, expired: number) {
  const payload = JSON.stringify({ type: "signals", signals, generated, closed, expired, ts: new Date().toISOString() });
  for (const client of clients) {
    try {
      client.write(`event: signals\ndata: ${payload}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

export function clientCount() {
  return clients.size;
}