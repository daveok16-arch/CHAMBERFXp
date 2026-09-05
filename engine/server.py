"""
Engine HTTP service (stdlib, zero deps): exposes model prediction, training,
job status, and DB reads over JSON. Designed to be supervised (auto-restart)
and proxied by the Node API.
"""
import json
import os
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# allow running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine.jobs as jobs
from engine.model_registry import load_latest_model, latest_info
from engine.worker import worker

# Prefer ENGINE_PORT explicitly; fall back to PORT (Render injects it per
# service) then 8800. The web service clears PORT for the engine child so it
# never tries to bind the web port.
_port_raw = (os.environ.get("ENGINE_PORT") or "").strip() or (os.environ.get("PORT") or "").strip() or "8800"
PORT = int(_port_raw)


def _predict(params: dict):
    try:
        import pandas as pd
        from ml_engine import MLEngine
        engine = MLEngine()
        row = params.get("features") or {}
        if not isinstance(row, dict) or not row:
            return {"error": "features required"}
        dirn, conf = engine.predict_direction(row)
        return {"direction": int(dirn), "confidence": round(float(conf), 4)}
    except Exception as e:
        return {"error": f"prediction failed: {e}"}


def _train(params: dict):
    from ml_engine import MLEngine
    import config

    engine = MLEngine()
    symbol = params.get("symbol") or config.TRADING_CONFIG["SYMBOL"]
    limit = int(params.get("limit") or 2500)

    from data_ingestion import DataIngestor
    from feature_engineering import extract_technical_features, map_multi_timeframe

    ing = DataIngestor(symbol=symbol)
    df_5m = ing.fetch_historical_ohlcv(limit=min(limit, 2500), timeframe="5m")
    df_1h = ing.fetch_historical_ohlcv(limit=500, timeframe="1h")
    df_4h = ing.fetch_historical_ohlcv(limit=200, timeframe="4h")
    df_1d = ing.fetch_historical_ohlcv(limit=50, timeframe="1d")

    aligned = map_multi_timeframe(
        extract_technical_features(df_5m),
        extract_technical_features(df_1h),
        extract_technical_features(df_4h),
        extract_technical_features(df_1d),
    )

    metrics = engine.train_and_calibrate(aligned)

    from engine.model_registry import save_model
    from ml_engine import MLEngine as _ME
    save_model(engine.model, {
        "version": f"{symbol.replace('/', '')}-{int(time.time())}",
        "accuracy": metrics.get("val_accuracy"),
        "f1": metrics.get("val_f1"),
        "class_balance": metrics.get("class_balance"),
        "features": engine.features,
    })
    return {"metrics": metrics, "symbol": symbol}


def _backtest(params: dict):
    import pandas as pd
    from backtester import EnhancedBacktester
    import numpy as np
    import config
    from data_ingestion import DataIngestor

    symbol = params.get("symbol") or config.TRADING_CONFIG["SYMBOL"]
    limit = int(params.get("limit") or 1000)
    ing = DataIngestor(symbol=symbol)
    df = ing.fetch_historical_ohlcv(limit=min(limit, 1000), timeframe="5m")

    bt = EnhancedBacktester(df)
    # naive rule signals for parity with the TS backtest route
    closes = df["close"]
    sma_fast = closes.rolling(10).mean()
    sma_slow = closes.rolling(30).mean()
    signals = pd.Series("HOLD", index=df.index)
    signals[sma_fast > sma_slow] = "BUY"
    signals[sma_fast < sma_slow] = "SELL"
    confidences = pd.Series(0.6, index=df.index)

    result = bt.run_backtest(signals, confidences)
    # strip bulky equity curve/trades for the wire
    result.pop("equity_curve", None)
    result.pop("trades", None)
    return result


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode())
        except Exception:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/health":
            self._send(200, {"status": "ok", "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        elif path == "/status":
            self._send(200, {
                "model": latest_info(),
                "jobs": jobs.queue.list()[-20:],
                "uptimeSec": int(time.time() - self.server.start_time),
            })
        elif path == "/db/predictions":
            from storage import get_predictions_as_dicts
            limit = int(qs.get("limit", ["100"])[0])
            self._send(200, get_predictions_as_dicts(limit=limit))
        elif path == "/db/trades":
            from storage import get_trades_as_dicts
            limit = int(qs.get("limit", ["100"])[0])
            self._send(200, get_trades_as_dicts(limit=limit))
        elif path == "/models":
            from engine.model_registry import list_models
            self._send(200, {"models": list_models()})
        elif path == "/worker/status":
            self._send(200, worker.status())
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        payload = self._read_json()

        if path == "/predict":
            self._send(200, _predict(payload))
        elif path == "/train":
            job_id = jobs.queue.submit("train", lambda p=payload: _train(p), params=payload)
            self._send(202, {"job_id": job_id, "status": "queued"})
        elif path == "/backtest":
            job_id = jobs.queue.submit("backtest", lambda p=payload: _backtest(p), params=payload)
            self._send(202, {"job_id": job_id, "status": "queued"})
        elif path == "/worker/start":
            worker.start()
            self._send(200, worker.status())
        elif path == "/worker/stop":
            worker.stop()
            self._send(200, worker.status())
        else:
            self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # quiet default logging
        pass


class EngineServer(ThreadingHTTPServer):
    def __init__(self, addr, handler):
        super().__init__(addr, handler)
        self.start_time = time.time()


def main():
    # Retry bind briefly to tolerate transient EADDRINUSE (e.g. a just-closed
    # probe socket in TIME_WAIT, or the parent's readiness check racing us).
    delay = 0.25
    server = None
    for attempt in range(10):
        try:
            server = EngineServer(("0.0.0.0", PORT), Handler)
            break
        except OSError as e:
            if "Address already in use" in str(e) and attempt < 9:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    if server is None:
        raise RuntimeError(f"unable to bind :{PORT}")
    print(f"[engine] listening on :{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()