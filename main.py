"""
Central Execution Orchestrator v2.0 (main.py)
Enhanced coordination of multi-pair trading, real-time ingestion,
ensemble ML inference, and institutional risk management.
"""

import time
import calendar
from datetime import datetime, timezone
from typing import Tuple
import pandas as pd
import numpy as np

import config
import storage
from storage import logger
from data_ingestion import DataIngestor
from feature_engineering import extract_technical_features, map_multi_timeframe
from ml_engine import MLEngine
from signal_generator import SignalGenerator


class TradingBot:
    """Main trading bot orchestrator."""

    def __init__(self, symbol: str = None):
        self.symbol = symbol or config.TRADING_CONFIG["SYMBOL"]
        storage.init_db()

        self.ingestor = DataIngestor(symbol=self.symbol)
        self.ml_engine = MLEngine()
        self.signal_generator = SignalGenerator()

        # State tracking
        self.active_position_id = -1
        self.position_direction = "HOLD"
        self.bars_since_retrain = 0
        self.daily_trade_count = 0
        self.last_trade_date = None

        # Performance tracking
        self.equity = 10000.0
        self.peak_equity = 10000.0
        self.max_drawdown = 0.0

    def fetch_data(self) -> pd.DataFrame:
        """Fetch and process multi-timeframe data."""
        try:
            df_5m = self.ingestor.fetch_historical_ohlcv(limit=2500, timeframe="5m")
            df_1h = self.ingestor.fetch_historical_ohlcv(limit=500, timeframe="1h")
            df_4h = self.ingestor.fetch_historical_ohlcv(limit=200, timeframe="4h")
            df_daily = self.ingestor.fetch_historical_ohlcv(limit=50, timeframe="1d")
        except Exception as e:
            logger.critical(f"Failed to fetch data: {e}", exc_info=True)
            return None

        logger.info("Data fetched. Engineering features...")

        # Extract features for each timeframe
        feat_5m = extract_technical_features(df_5m)
        feat_1h = extract_technical_features(df_1h)
        feat_4h = extract_technical_features(df_4h)
        feat_daily = extract_technical_features(df_daily)

        # Map multi-timeframe features
        aligned_df = map_multi_timeframe(feat_5m, feat_1h, feat_4h, feat_daily)

        return aligned_df

    def train_model(self, df: pd.DataFrame) -> bool:
        """Train/retrain the ML model."""
        try:
            logger.info("Training ensemble model...")
            metrics = self.ml_engine.train_and_calibrate(df)
            logger.info(f"Model trained: Acc={metrics['val_accuracy']:.2%}, F1={metrics['val_f1']:.3f}")
            self.bars_since_retrain = 0
            return True
        except Exception as e:
            logger.error(f"Training failed: {e}")
            return False

    def check_risk_limits(self) -> Tuple[bool, str]:
        """Check if risk limits are breached."""
        # Daily trade limit
        today = datetime.now().date()
        if self.last_trade_date != today:
            self.daily_trade_count = 0
            self.last_trade_date = today

        if self.daily_trade_count >= config.TRADING_CONFIG.get("MAX_DAILY_TRADES", 5):
            return False, "Daily trade limit reached"

        # Drawdown limit
        current_dd = (self.peak_equity - self.equity) / self.peak_equity
        if current_dd > config.TRADING_CONFIG.get("MAX_DRAWDOWN_LIMIT", 0.12):
            return False, "Max drawdown limit exceeded"

        return True, "Risk checks passed"

    def execute_tick(
        self,
        current_price: float,
        current_time: datetime,
        aligned_df: pd.DataFrame
    ) -> Tuple[str, str]:
        """Execute a single trading tick."""
        # Update equity and drawdown
        if current_price > 0:
            self.peak_equity = max(self.peak_equity, self.equity)
            dd = (self.peak_equity - self.equity) / self.peak_equity
            self.max_drawdown = max(self.max_drawdown, dd)

        # Check risk limits
        can_trade, reason = self.check_risk_limits()
        if not can_trade:
            return "HOLD", reason

        # Build latest bar
        latest_idx = aligned_df.index[-1] + pd.Timedelta(minutes=5)
        new_row = {
            "open": aligned_df["close"].iloc[-1],
            "high": max(aligned_df["close"].iloc[-1], current_price),
            "low": min(aligned_df["close"].iloc[-1], current_price),
            "close": current_price,
            "volume": 25.0
        }

        # Update dataframe
        temp_df = aligned_df.copy()
        temp_df.loc[latest_idx] = new_row

        # Extract features
        feat_df = extract_technical_features(temp_df)
        latest_features = feat_df.iloc[-1].to_dict()

        # ML prediction
        pred_dir, confidence = self.ml_engine.predict_direction(latest_features)

        # Log prediction
        storage.log_prediction(
            symbol=self.symbol,
            predicted_direction=pred_dir,
            confidence_score=confidence,
            features_snapshot=latest_features,
            model_version="v2.0"
        )

        # Retroactively resolve previously unresolved predictions (no look-ahead bias)
        self._backfill_prediction_outcomes(temp_df["close"])

        # Generate signal
        action, reason = self.signal_generator.evaluate_signal(pred_dir, confidence, latest_features)

        # Execute trade
        if action != self.position_direction:
            if self.active_position_id != -1:
                self._close_position(current_price, action)

            if action in ["BUY", "SELL"]:
                self._open_position(action, current_price, confidence)
                self.daily_trade_count += 1

        self.bars_since_retrain += 1

        # Check for retraining
        if self.bars_since_retrain >= config.ML_CONFIG.get("RETRAIN_INTERVAL_BARS", 300):
            logger.info("Retraining model...")
            self.train_model(feat_df)

        return action, reason

    def _backfill_prediction_outcomes(self, closes: pd.Series) -> None:
        """
        Resolves pending predictions once their labeling horizon has spanned.

        For each unresolved prediction with timestamp t, we look at close prices
        strictly after t up to N bars later and apply the same triple-barrier rule
        used during training (config.ML_CONFIG thresholds).
        """
        horizon = config.ML_CONFIG.get("LABEL_HORIZON_N", 12)
        bull_th = config.ML_CONFIG.get("BULL_THRESHOLD_X", 0.004)
        bear_th = config.ML_CONFIG.get("BEAR_THRESHOLD_Y", -0.004)

        try:
            pending = storage.get_unresolved_predictions(limit=500)
        except Exception as e:
            logger.error(f"Failed to load unresolved predictions for backfill: {e}")
            return

        if not pending:
            return

        close_values: np.ndarray = closes.to_numpy()
        close_index: pd.DatetimeIndex = closes.index

        for pred_id, timestamp_str, symbol, pred_dir in pending:
            # Only resolve predictions for the currently streamed symbol
            if symbol != self.symbol:
                continue

            try:
                pred_dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                if pred_dt.tzinfo is None:
                    pred_dt = pred_dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue

            # Convert the (UTC) prediction timestamp to epoch seconds for index search
            pred_ts = calendar.timegm(pred_dt.utctimetuple())

            # Convert bar index timestamp to UTC epoch for comparison (index is naive UTC)
            start = 0
            for i, ts in enumerate(close_index):
                ts_epoch = calendar.timegm(ts.timetuple())
                if ts_epoch > pred_ts:
                    start = i
                    break
            else:
                continue  # No later bars yet

            # Need the N-bar horizon to elapse before resolving (avoid look-ahead)
            # Training labeler uses close[i+1 .. i+N]; here entry bar is start-1,
            # so we need indices start .. start+N-1 (i.e. end = start+N <= len).
            end = start + horizon
            if end > len(close_values):
                continue  # Not enough data yet — wait for more bars

            window = close_values[start:end]
            entry_price = close_values[start - 1] if start > 0 else close_values[start]
            if entry_price <= 0:
                continue

            max_ret = (window.max() - entry_price) / entry_price
            min_ret = (window.min() - entry_price) / entry_price

            if max_ret >= bull_th and min_ret > bear_th:
                actual = 1
            elif min_ret <= bear_th and max_ret < bull_th:
                actual = -1
            elif max_ret >= bull_th and min_ret <= bear_th:
                first_max_idx = window.argmax()
                first_min_idx = window.argmin()
                actual = 1 if first_max_idx <= first_min_idx else -1
            else:
                actual = 0

            storage.update_prediction_outcome(pred_id, actual)
            logger.info(f"Resolved prediction ID {pred_id}: actual_outcome={actual}")

    def _open_position(self, direction: str, entry_price: float, confidence: float):
        """Open a new position."""
        self.position_direction = direction
        self.active_position_id = storage.log_trade_entry(
            symbol=self.symbol,
            direction=direction,
            entry_price=entry_price,
            confidence=confidence
        )
        logger.warning(f"Opened {direction} position at {entry_price:.2f}")

    def _close_position(self, exit_price: float, reversal_signal: str):
        """Close the ACTIVE position, not the most recent/smallest ID row."""
        entry_row = storage.get_all_logged_trades()
        if not entry_row:
            return

        # trades columns: (id, entry_timestamp, exit_timestamp, symbol,
        #                   direction, entry_price, exit_price, pnl_pct, confidence, status)
        active_rows = [r for r in entry_row if r[9] == "OPEN"]
        if not active_rows:
            return

        entry_row = active_rows[0]
        entry_price = float(entry_row[5])   # entry_price column
        direction = str(entry_row[4])       # direction column

        # Calculate PnL
        fees = config.TRADING_CONFIG["TRANSACTION_COST"] + \
            config.TRADING_CONFIG["SLIPPAGE_PCT"]

        if direction == "BUY":
            pnl = ((exit_price - entry_price) / entry_price) - fees
        else:
            pnl = ((entry_price - exit_price) / entry_price) - fees

        # Update equity
        self.equity *= (1 + pnl)

        storage.log_trade_exit(int(entry_row[0]), exit_price, pnl)
        logger.warning(f"Closed {direction} position: PnL={pnl:.2%}, Equity=${self.equity:.2f}")

        self.active_position_id = -1
        self.position_direction = "HOLD"

    def run(self, max_ticks: int = 20):
        """Main execution loop."""
        logger.info(f"Initializing trading bot for {self.symbol}...")

        # Fetch and prepare data
        aligned_df = self.fetch_data()
        if aligned_df is None:
            logger.critical("Failed to fetch data. Exiting.")
            return

        # Initial model training
        if len(aligned_df) >= config.ML_CONFIG["MIN_TRAINING_BARS"]:
            self.train_model(aligned_df)
        else:
            logger.warning(f"Insufficient data ({len(aligned_df)} bars) for training")

        # Start real-time polling
        self.ingestor.stream_realtime_data_polling(interval_sec=5.0)
        logger.info("Real-time polling started.")

        try:
            for tick in range(max_ticks):
                time.sleep(4)

                with self.ingestor.lock:
                    current_price = self.ingestor.live_ticker["price"]
                    current_time = datetime.fromtimestamp(
                        self.ingestor.live_ticker["timestamp"] / 1000
                    )

                if current_price == 0.0:
                    logger.debug("Waiting for price data...")
                    continue

                logger.info(f"[Tick {tick+1}] Price: ${current_price:.2f}")

                action, reason = self.execute_tick(current_price, current_time, aligned_df)

                if action != "HOLD":
                    logger.warning(f"SIGNAL: {action} | {reason}")

        except KeyboardInterrupt:
            logger.info("Shutdown requested...")
        finally:
            self.ingestor.shutdown()
            logger.info(f"Session ended. Final equity: ${self.equity:.2f}")


def execute_trading_system():
    """Entry point."""
    bot = TradingBot()
    bot.run()


if __name__ == "__main__":
    execute_trading_system()
