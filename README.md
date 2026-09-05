# CHAMBERFX — Institutional Quantitative Signal Terminal

Institutional-style trading dashboard: React SPA + Node/Express API + Python
ML engine (data ingestion, feature engineering, ensemble model, backtesting).

## Architecture

- **Web + API** (`server.ts`, `server/`) — Express server, server-authoritative
  signal engine, durable store (JSON file or Postgres), SSE live push, Prometheus
  metrics, admin-token auth. The Python engine is auto-spawned on the same
  instance via `server/engineSpawner.ts`.
- **Python engine** (`engine/`) — stdlib HTTP service (`engine/server.py`) with
  `/predict`, `/train`, `/backtest`, `/worker/*`, model registry, job queue, and
  a supervised worker.
- **Frontend** (`src/`) — React terminal UI with KPI strip, live signal feed,
  SSE updates, analysis drawers.

## Run Locally

**Prerequisites:** Node.js 20+, Python 3 + `pip install -r requirements.txt`

1. `npm install`
2. `pip3 install -r requirements.txt`
3. Optional: set `GEMINI_API_KEY` / `ADMIN_TOKEN` in `.env` (see `.env.example`)
4. `npm run dev`  (Node auto-spawns the engine on :8800)

## Test / Lint / Build

```bash
npm test        # TS + Python unit tests
npm run lint    # tsc --noEmit
npm run build   # vite + esbuild -> dist/server.cjs
```

## Deploy on Render

The repo ships `render.yaml` (single web service). On deploy:

1. **Push to GitHub** → create a Render service from this repo.
2. Render runs `npm install && (pip3 install -r requirements.txt || true) && npm run build`
   then `npm run start`.
3. The Node process auto-spawns the Python engine on `ENGINE_PORT` (8800) and
   proxies `/api/python/*` to it. No extra service needed on the free plan.
4. Set env vars in Render dashboard:
   - `GEMINI_API_KEY` (optional)
   - `ADMIN_TOKEN` (optional — protects write endpoints; leave unset for local)
   - `ENGINE_URL` / `ENGINE_PORT` (defaults to localhost:8800)
5. Health check: `/api/health`. Metrics: `/metrics`. Readiness: `/api/ready`.

The committed `dist/` bundle + `prestart` self-heal ensure `npm run start`
works even if the platform skips the build step.

## Docker (optional)

```bash
docker compose up --build   # api+engine+postgres+redis+prometheus+grafana
```
