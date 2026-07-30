"""
Central Execution Orchestrator (main.py)
Coordinating real-time ingestion, continuous technical feature engineering,
calibrated machine learning inference, multi-timeframe confirmation checks,
sqlite logs management, and rolling model retraining loops.
"""

import time
from datetime import datetime
import pandas as pd
import numpy as np

import config
import storage
from storage import logger
from data_ingestion import DataIngestor
from feature_engineering import extract_technical_features, map_multi_timeframe
from ml_engine import MLEngine
from signal_generator import SignalGenerator


def execute_trading_system():
    logger.info("Initializing AI-Powered Trading Signal Bot Orchestrator...")
    
    # 1. Initialize SQLite storage DB schema
    storage.init_db()
    
    # 2. Setup systems
    symbol = config.TRADING_CONFIG["SYMBOL"]
    ingestor = DataIngestor(symbol=symbol)
    ml_engine = MLEngine()
    signal_generator = SignalGenerator()
    
    # Track current active market states
    active_position_id: int = -1
    position_direction: str = "HOLD"
    new_bar_logged_counter: int = 0
    
    # 3. Pull Initial Historical Datasets for Local (5m), Macro (1h), and Macro (4h) timeframes
    try:
        df_5m = ingestor.fetch_historical_ohlcv(limit=2500, timeframe="5m")
        df_1h = ingestor.fetch_historical_ohlcv(limit=500, timeframe="1h")
        df_4h = ingestor.fetch_historical_ohlcv(limit=200, timeframe="4h")
    except Exception as e:
        logger.critical(f"Failed to synchronize initial historical datasets: {e}", exc_info=True)
        return
        
    logger.info("Sync complete. Engineering indicators across timeframes...")
    
    # 4. Generate features and align multi-timeframe trend boundaries
    feat_5m = extract_technical_features(df_5m)
    feat_1h = extract_technical_features(df_1h)
    feat_4h = extract_technical_features(df_4h)
    aligned_df = map_multi_timeframe(feat_5m, feat_1h, feat_4h)
    
    # 5. Model Retraining and Calibration sequence on startup (if enough historical bars logged)
    try:
        logger.info("Verifying model state and preparing initial training pipeline...")
        metrics = ml_engine.train_and_calibrate(aligned_df)
        logger.info(f"Startup model training calibration metrics validated: Accuracy={metrics['val_accuracy']:.2%}")
    except Exception as e:
        logger.error(f"Could not retrain startup model: {e}. Utilizing active serialized model parameters.")
        
    # 6. Start real-time background market ticker ingestion
    ingestor.stream_realtime_data_polling(interval_sec=5.0)
    
    logger.info("⚡ Bot successfully loaded in continuous live trading session mode. Ingesting feeds...")
    
    # 7. Real-Time Execution Evaluation Loop (Simulation Tick)
    tick_count = 0
    max_ticks = 20  # Safe bounds for script execution demonstration
    
    try:
        while tick_count < max_ticks:
            tick_count += 1
            time.sleep(4)  # 4 seconds mock tick spacing
            
            # Fetch latest live price state from in-memory stream buffer
            with ingestor.lock:
                current_price = ingestor.live_ticker["price"]
                current_time = ingestor.live_ticker["timestamp"]
                
            if current_price == 0.0:
                logger.info("Waiting for real-time order ticks to stabilize...")
                continue
                
            logger.info(f"[Tick #{tick_count}] Current {symbol} Live Price = {current_price:.2f}")
            
            # Mock incremental bar updates (every tick is evaluated as an execution state)
            # We append the live pricing tick to the aligned dataframe to perform real-time feature extraction
            latest_idx = aligned_df.index[-1] + pd.Timedelta(minutes=5)
            
            # Build mock new row mimicking latest OHLCV
            new_row_val = {
                "open": aligned_df["close"].iloc[-1],
                "high": max(aligned_df["close"].iloc[-1], current_price),
                "low": min(aligned_df["close"].iloc[-1], current_price),
                "close": current_price,
                "volume": 25.0
            }
            
            # Append & recalculate features
            temp_df = aligned_df.copy()
            temp_df.loc[latest_idx] = new_row_val
            
            # Extract technical indicators for the active bar
            feat_temp = extract_technical_features(temp_df)
            latest_features = feat_temp.iloc[-1].to_dict()
            
            # 8. Run calibrated Machine Learning model prediction
            pred_dir, confidence = ml_engine.predict_direction(latest_features)
            
            # Log forecasting event to local SQLite predictions database for performance auditing
            pred_id = storage.log_prediction(
                symbol=symbol,
                predicted_direction=pred_dir,
                confidence_score=confidence,
                features_snapshot=latest_features,
                model_version="v2.0"
            )
            
            # 9. Evaluate through multi-timeframe risk filters and ADX regimes
            action, reason = signal_generator.evaluate_signal(pred_dir, confidence, latest_features)
            
            # 10. Execute trade positions logging (Simulate order entry/exit)
            if action != position_direction:
                # Signal shift! Handle liquidation of previous transaction
                if active_position_id != -1:
                    logger.warning(f"Closing position #{active_position_id} for {position_direction}. Exit Price={current_price:.2f}")
                    # Compute simulated PnL (Fees + slippage and price ratio returns)
                    fees_and_slip = config.TRADING_CONFIG["TRANSACTION_COST"] + config.TRADING_CONFIG["SLIPPAGE_PCT"]
                    if position_direction == "BUY":
                        pnl = ((current_price - aligned_df["close"].iloc[-1]) / aligned_df["close"].iloc[-1]) - fees_and_slip
                    else:
                        pnl = ((aligned_df["close"].iloc[-1] - current_price) / aligned_df["close"].iloc[-1]) - fees_and_slip
                        
                    storage.log_trade_exit(active_position_id, exit_price=current_price, pnl_pct=pnl)
                    active_position_id = -1
                    position_direction = "HOLD"
                    
                if action in ["BUY", "SELL"]:
                    # Open new trade entry
                    position_direction = action
                    active_position_id = storage.log_trade_entry(
                        symbol=symbol,
                        direction=action,
                        entry_price=current_price,
                        confidence=confidence
                    )
                    
            new_bar_logged_counter += 1
            
            # 11. Sliding Training Trigger
            # Automatically check if sliding bar retraining threshold is crossed
            if new_bar_logged_counter >= config.ML_CONFIG["RETRAIN_INTERVAL_BARS"]:
                logger.info("Sliding window retraining threshold crossed. Initiating rolling models fit...")
                try:
                    # Sync new aligned dataframe including recently logged predictions history
                    ml_engine.train_and_calibrate(temp_df)
                    new_bar_logged_counter = 0
                except Exception as e:
                    logger.error(f"Error during scheduled retrain loop: {e}")
                    
        logger.info("Completed simulation tick sequence successfully.")
        
    except KeyboardInterrupt:
        logger.warning("Bot orchestrator received user kill request. Initiating graceful shutdown...")
    finally:
        ingestor.shutdown()
        logger.info("AI-Powered Algorithmic trading system successfully shut down.")


if __name__ == "__main__":
    execute_trading_system()
