"""
Configuration parameters for the AI-Powered Trading Signal Bot.
Handles API credentials, trading pairs, model hyperparameters, risk filters,
transaction costs, and database file paths.
"""

import os
from typing import Dict, Any

# ==============================================================================
# System & Path Configurations
# ==============================================================================
BASE_DIR: str = os.path.dirname(os.path.abspath(__file__))
DB_PATH: str = os.path.join(BASE_DIR, "trading_bot.db")
LOG_FILE: str = os.path.join(BASE_DIR, "app.log")

# ==============================================================================
# Market & Trading Settings
# ==============================================================================
TRADING_CONFIG: Dict[str, Any] = {
    "SYMBOL": "BTC/USDT",               # Execution trading pair
    "BASE_CURRENCY": "USDT",           # Quote currency
    "EXECUTION_TIMEFRAME": "5m",       # Execution lower timeframe
    "MACRO_TIMEFRAME_1": "1h",         # Higher confirmation timeframe 1
    "MACRO_TIMEFRAME_2": "4h",         # Higher confirmation timeframe 2
    
    # Cost & Execution Parameters
    "TRANSACTION_COST": 0.001,         # 0.1% transaction fee (taker bias)
    "SLIPPAGE_PCT": 0.0005,            # 0.05% expected execution slippage
    "BID_ASK_SPREAD": 0.0002,          # 0.02% average bid-ask spread
    
    # Risk Limits
    "CONFIDENCE_THRESHOLD": 0.70,      # Minimum classifier probability for signal
    "MAX_DRAWDOWN_LIMIT": 0.15,        # 15% maximum equity drawdown limit
    "REGIME_FILTER_ENABLED": True,     # Filter signals by volatility regime
}

# ==============================================================================
# Feature Engineering Settings
# ==============================================================================
FEATURE_CONFIG: Dict[str, Any] = {
    # Indicator Periods
    "RSI_PERIOD": 14,
    "MACD_FAST": 12,
    "MACD_SLOW": 26,
    "MACD_SIGNAL": 9,
    "ATR_PERIOD": 14,
    "BB_PERIOD": 20,
    "BB_STD": 2.0,
    "EMA_SHORT": 20,
    "EMA_LONG": 50,
    
    # Statistical parameters
    "LOG_RETURN_LAGS": [1, 2, 3, 5],
    "SKEW_KURT_LOOKBACK": 30,          # Rolling stats lookback
}

# ==============================================================================
# Machine Learning Engine Hyperparameters
# ==============================================================================
ML_CONFIG: Dict[str, Any] = {
    # Labeling definition
    "LABEL_HORIZON_N": 12,             # Number of periods into future to evaluate label
    "BULL_THRESHOLD_X": 0.005,         # Target return threshold for Bullish label (+0.5%)
    "BEAR_THRESHOLD_Y": -0.005,        # Target return threshold for Bearish label (-0.5%)
    
    # Training Parameters
    "TRAIN_TEST_SPLIT": 0.8,
    "RETRAIN_INTERVAL_BARS": 500,      # Retrain model after logging N new data points
    "MIN_TRAINING_BARS": 2000,         # Minimum historical dataset required to train
    
    # Classifier Hyperparameters (Optimized RandomForest)
    "MODEL_PARAMS": {
        "n_estimators": 150,
        "max_depth": 8,
        "min_samples_leaf": 4,
        "random_state": 42,
        "n_jobs": -1
    },
    
    # Probability Calibration
    "CALIBRATION_METHOD": "sigmoid",   # 'sigmoid' (Platt scaling) or 'isotonic'
}

# ==============================================================================
# API Connection & WebSockets
# ==============================================================================
API_CONFIG: Dict[str, Any] = {
    "BINANCE_PUBLIC_WS": "wss://stream.binance.com:9443/ws",
    "RETRY_ATTEMPTS": 5,
    "RETRY_DELAY": 5,                  # Seconds to wait before reconnecting
    "WS_KLINE_STREAM": "btc_usdt_kline_5m",
}
