// API hardening: request-id logging, admin-token auth, health info, fetch timeouts.
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.headers["x-request-id"] || crypto.randomBytes(6).toString("hex");
  res.setHeader("x-request-id", id);
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[req] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms id=${id}`);
  });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN) return next(); // no token configured -> allow (local/dev)
  const token = req.headers["x-admin-token"] || req.query["token"];
  if (token === ADMIN_TOKEN) return next();
  res.status(401).json({ error: "Unauthorized" });
}

export function healthInfo() {
  return {
    status: "ok",
    uptimeSec: Math.round(process.uptime()),
    ts: new Date().toISOString(),
    node: process.version,
    env: process.env.NODE_ENV || "development",
  };
}

export async function fetchWithTimeout(url: string, ms = 8000, init: RequestInit = {}): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
