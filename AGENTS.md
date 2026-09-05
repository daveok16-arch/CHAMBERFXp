# CHAMBERFXp — AI Trading Signal Bot

Institutional-style trading dashboard. Blend of TypeScript (Node/Express + React/Vite)
frontend/server and Python (data ingestion, ML, backtesting) data engines.

## Architecture Overview

- **`server.ts`** (1595 lines) — Express server + all HTTP API routes. Entry point via
  `npm run dev` (tsx server.ts), `npm run build` then `npm run start` (production).
  Serves React SPA (Vite dev middleware or `dist/` static in production) and runs:
  - `/api/scan?symbol=` — single-symbol technical scan + optional Gemini ML calibration
  - `/api/market-scan?type=crypto|forex` — bulk multi-asset scans (19 assets)
  - `/api/forex` — Yahoo quote prices only
  - `/api/backtest` — TS-only backtest (Binance klines)
  - `/api/signals` GET/POST/DELETE — in-memory live signal store (`liveSignalStore`)
  - `/api/python/files`, `/api/python/logs`, `/api/python/status`,
    `/api/python/run` (spawns `python3 main.py`), `/api/python/stop` — Python engine bridge
  - `/api/python/db/predictions|trades` — SQLite queries via `storage.get_*_as_dicts` (support `?limit=`)
- **Python engine** (runs independently, spawned by `/api/python/run`):
  - `config.py` — all trading/ML/risk/API parameters (7 pairs defined, ACTIVE= BTC/USDT)
  - `data_ingestion.py` — Binance REST historical OHLCV + synthetic fallback + ticker poll thread
  - `feature_engineering.py` — ~45 technical/statistical features + multi-timeframe mapping
  - `ml_engine.py` — sklearn ensemble (RF+GB+Ada, calibrated, soft-voting)or `EnhancedFallbackClassifier`; persists `ensemble_model.pkl` in repo root
  - `signal_generator.py` — composite score, regime filter, MTF validation, SL/TP calc
  - `storage.py` — SQLite (`trading_bot.db`) schema: `predictions`, `trades`, `performance_metrics`
  - `backtester.py` — `EnhancedBacktester` (walk-forward, Monte Carlo, regime perf)
  - `main.py` — `TradingBot` orchestrator (`run(max_ticks=20)`, equity starts at $10,000)
- **Frontend** (`src/`): `App.tsx` → `components/Dashboard.tsx` (1531 lines, all UI)
  - `utils/marketHours.ts` — market open/close logic (forex, gold, crypto)
  - `utils/rrFramework.ts` — asset-class RR profiles, Kelly sizing, dynamic SL/TP, signal scoring
  - `utils/signalEngine.ts` — client-side pair state machine (IDLE/ACTIVE/COOLDOWN/LOCKED),
    signal generation, dedup, pips/pnl sanitization
  - `types.ts` — shared interfaces

## Client-Side Signal Generation (IMPORTANT)

Live signals are NOT generated server-side. `Dashboard.tsx` `useEffect([marketScans])`
drives it: each scan tick expires stale signals (price drift/opposite signal), checks
`canGenerateNewSignal`, creates signals (ALocalStorage `ai_studio_live_signals_v2`) and
POSTs them to `/api/signals` (server just caches in memory; lost on restart).
TP/SL derived from `getAssetRRProfile().tpMultiplier * ATR` (SL = 1.0 * ATR).
Trailing stop activates at 50% toward TP. Time expiry: 4h/<25% progress or 8h/<40% or 24h max.

## Data Sources / Resilience

- Crypto: Binance (global→US→Yahoo fallback); Forex/Gold: Yahoo Finance
  `query1.finance.yahoo.com` with browser User-Agent; synthetic deterministic fallbacks
- Rate limiting: per-service backoff (`apiBackoffs`) + `memoryScanCache` (stale-cache serving);
  Gemini quota hits ⇒ 10-min cooldown (`geminiCoolDownUntil`)
- Market status (on/off hours) from `getMarketStatus` (forex Fri 22:00–Sun 22:00 UTC;
  gold: Fri 22:00–Sun 23:00 UTC + low-liquidity Mon-Fri 00:00–08:00 UTC)

## Data Flow (frontend polling)

- `Market-scan` bulk poll: crypto every 15s, forex every 30s
- Signal reconciliation loop runs per marketScans change: expire→close→generate→persist
- NO synthetic price jitter — prices only update from real `/api/market-scan` data (removed 2026-09-05)

## Build / Run / Deps & Hosting

- Node >=20 (Node 22 installed). Python 3 + `pandas numpy scikit-learn requests` required
  (NOT installed in current env — `pip install -r requirements.txt` if training/backtesting needed)
- Scripts: `dev` tsx server.ts · `build` vite build && esbuild bundle server.ts ·
  `start` node dist/server.cjs · `lint` tsc --noEmit
- Deps: express, @google/genai, vite, react 19, tailwind v4, recharts, motion, lucide
- Secrets: only `GEMINI_API_KEY` (optional — no key ⇒ heuristic fallbacks, no AI insight)
- Deploy: `render.yaml` (web service, `npm install && (pip3 install -r requirements.txt || true) && npm run build`, start `node dist/server.cjs`); also AI Studio / Google Cloud Run artifact
- Hosts allowed: `chamberfxp.onrender.com` + `ALLOWED_HOSTS` env (vite.config.ts)
- Git: single shallow clone commit (HEAD 4dfa4ee "feat: Add progress bar showing TP completion"`; origin = https://github.com/daveok16-arch/CHAMBERFXp.git (main)

## Known Gaps / Gotchas

- `server.ts` API consumers don't handle `isStale`/`isAiCalibrated` gracefully in some fallbacks
- `main.py` `_close_position` now closes the ACTIVE (`status='OPEN'`) trade row (was first row bug); fixed 2026-09-05
- `predictions.actual_outcome` now resolved each tick by `_backfill_prediction_outcomes` in main.py (same triple-barrier rule as training; fixed 2026-09-05)
- Dashboard `getStaticMetadata` and some expanded-card text have hardcoded marketing-style strings
- `api/python/db/predictions|trades` — query SQLite via `storage.get_*_as_dicts` (limit param, default 100; max 500) — fixed 2026-09-05
- No tests, no CI config; python deps not vendored; `dist/` & `node_modules/` absent
  until `npm install`/`npm run build`