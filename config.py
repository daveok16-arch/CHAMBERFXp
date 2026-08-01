"""
Configuration for AI Trading Signal Bot v2.0
Institutional-grade parameters with multi-pair support and optimized risk management.
"""

import os
from typing import Dict, Any, List

BASE_DIR = str(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "trading_bot.db")
LOG_FILE = os.path.join(BASE_DIR, "app.log")

# ==============================================================================
# TRADING PAIRS - Multi-Pair Support
# ==============================================================================
TRADING_PAIRS: List[Dict[str, Any]] = [
    {"symbol": "BTC/USDT", "name": "Bitcoin", "type": "CRYPTO", "priority": 1},
    {"symbol": "ETH/USDT", "name": "Ethereum", "type": "CRYPTO", "priority": 2},
    {"symbol": "SOL/USDT", "name": "Solana", "type": "CRYPTO", "priority": 3},
    {"symbol": "XAU/USD", "name": "Gold", "type": "COMMODITY", "priority": 1},
    {"symbol": "EUR/USD", "name": "Euro", "type": "FOREX", "priority": 1},
    {"symbol": "GBP/USD", "name": "Pound", "type": "FOREX", "priority": 2},
    {"symbol": "USD/JPY", "name": "Yen", "type": "FOREX", "priority": 3},
]

ACTIVE_SYMBOLS = ["BTC/USDT"]  # Start with BTC, expand later

TRADING_CONFIG: Dict[str, Any] = {
    "SYMBOL": "BTC/USDT",
    "BASE_CURRENCY": "USDT",
    "EXECUTION_TIMEFRAME": "5m",
    "MACRO_TIMEFRAME_1": "1h",
    "MACRO_TIMEFRAME_2": "4h",
    "MACRO_TIMEFRAME_3": "1d",  # NEW: Daily for macro trend
    
    # Cost Parameters
    "TRANSACTION_COST": 0.0004,   # 0.04% (Binance spot maker)
    "SLIPPAGE_PCT": 0.0002,       # 0.02% expected slippage
    "BID_ASK_SPREAD": 0.0001,    # 0.01% spread
    
    # Risk Management - IMPROVED
    "CONFIDENCE_THRESHOLD": 0.65,    # Slightly lower to catch more signals
    "MIN_SIGNAL_SCORE": 55,          # NEW: Composite score minimum
    "MAX_DRAWDOWN_LIMIT": 0.12,      # 12% max drawdown
    "MAX_POSITION_SIZE": 0.02,        # Max 2% per trade
    "MAX_DAILY_TRADES": 5,           # NEW: Daily trade limit
    "REGIME_FILTER_ENABLED": True,
    
    # Position Management
    "USE_KELLY_CRITERION": True,     # NEW: Kelly for position sizing
    "KELLY_FRACTION": 0.25,          # Kelly fraction (risk management)
    "TRAILING_STOP_ENABLED": True,
    "TRAILING_STOP_PCT": 0.015,       # 1.5% trailing stop
    
    # Session Filters
    "TRADE_ONLY_LIQUID_HOURS": True,  # Avoid low liquidity
}

# ==============================================================================
# FEATURE ENGINEERING - Enhanced Indicators
# ==============================================================================
FEATURE_CONFIG: Dict[str, Any] = {
    # RSI Variants
    "RSI_PERIOD": 14,
    "RSI_SMOOTH_PERIOD": 5,
    
    # MACD
    "MACD_FAST": 12,
    "MACD_SLOW": 26,
    "MACD_SIGNAL": 9,
    
    # ATR & Volatility
    "ATR_PERIOD": 14,
    "BB_PERIOD": 20,
    "BB_STD": 2.0,
    
    # EMAs
    "EMA_FAST": [8, 13, 21],
    "EMA_MEDIUM": [50, 100],
    "EMA_SLOW": [200],
    
    # Stochastic
    "STOCH_K": 14,
    "STOCH_D": 3,
    
    # CCI
    "CCI_PERIOD": 20,
    
    # Statistical
    "LOG_RETURN_LAGS": [1, 2, 3, 5, 8, 13],
    "SKEW_KURT_LOOKBACK": 30,
    "ROLLING_STD_PERIODS": [10, 20, 50],
}

# ==============================================================================
# MACHINE LEARNING - Ensemble Approach
# ==============================================================================
ML_CONFIG: Dict[str, Any] = {
    # Labeling
    "LABEL_HORIZON_N": 12,           # Look ahead period
    "BULL_THRESHOLD_X": 0.004,       # Reduced to 0.4% for more signals
    "BEAR_THRESHOLD_Y": -0.004,      # Reduced to -0.4%
    
    # Dynamic thresholds
    "USE_DYNAMIC_THRESHOLDS": True,
    "DYNAMIC_THRESHOLD_ATR_MULT": 1.5,
    
    # Training
    "TRAIN_TEST_SPLIT": 0.8,
    "RETRAIN_INTERVAL_BARS": 300,    # More frequent retraining
    "MIN_TRAINING_BARS": 1500,       # Reduced minimum
    "USE_WALK_FORWARD": True,        # NEW: Walk-forward validation
    
    # Ensemble Hyperparameters
    "MODEL_PARAMS": {
        "n_estimators": 150,
        "max_depth": 8,
        "min_samples_leaf": 4,
        "class_weight": "balanced",
        "random_state": 42,
        "n_jobs": -1
    },
    
    # Gradient Boosting
    "GB_PARAMS": {
        "n_estimators": 100,
        "max_depth": 5,
        "learning_rate": 0.1,
        "subsample": 0.8,
    },
    
    # Calibration
    "CALIBRATION_METHOD": "sigmoid",
    "CALIBRATION_CV_FOLDS": 3,
}

# ==============================================================================
# SIGNAL GENERATION - Smart Rules
# ==============================================================================
SIGNAL_CONFIG: Dict[str, Any] = {
    # Score Weights
    "ML_CONFIDENCE_WEIGHT": 0.40,
    "RSI_WEIGHT": 0.15,
    "TREND_WEIGHT": 0.15,
    "MTF_WEIGHT": 0.15,
    "VOLUME_WEIGHT": 0.10,
    "ADX_WEIGHT": 0.05,
    
    # Thresholds
    "MIN_SIGNAL_SCORE": 55,
    "HIGH_CONFIDENCE_SCORE": 75,
    
    # Regime-Specific
    "TRENDING_ADX_MIN": 25,
    "RANGING_ADX_MAX": 18,
    "VOLATILE_ATR_THRESHOLD": 0.025,
    
    # RSI Levels
    "RSI_OVERSOLD": 30,
    "RSI_OVERBOUGHT": 70,
    "RSI_NEUTRAL_LOW": 40,
    "RSI_NEUTRAL_HIGH": 60,
}

# ==============================================================================
# RISK MANAGEMENT - Advanced
# ==============================================================================
RISK_CONFIG: Dict[str, Any] = {
    # Position Sizing
    "BASE_RISK_PER_TRADE": 0.01,     # 1% base risk
    "KELLY_FRACTION": 0.25,          # Kelly fraction
    "MAX_POSITION_PCT": 0.02,        # Max 2% per trade
    
    # Stop Loss / Take Profit
    "DEFAULT_R_MULTIPLE": 2.0,        # Default R:R
    "MIN_R_MULTIPLE": 1.5,
    "ATR_STOP_MULTIPLIER": 1.5,       # 1.5x ATR for stop
    "ATR_TP_MULTIPLIER": 3.0,        # 3x ATR for take profit
    
    # Trailing Stop
    "USE_TRAILING_STOP": True,
    "TRAILING_STOP_ATR_MULT": 1.0,
    "TRAILING_STOP_ACTIVATION": 1.5,  # Activate after 1.5R profit
    
    # Drawdown Protection
    "MAX_DAILY_LOSS": 0.03,          # 3% daily loss limit
    "MAX_DRAWDOWN": 0.12,            # 12% equity drawdown limit
    "COOLDOWN_AFTER_LOSS": 3600,      # 1 hour cooldown after loss
    
    # Session Limits
    "MAX_TRADES_PER_DAY": 5,
    "MIN_TRADES_PER_HOUR": 2,        # Anti-spam
}

# ==============================================================================
# API & DATA
# ==============================================================================
API_CONFIG: Dict[str, Any] = {
    "BINANCE_PUBLIC_WS": "wss://stream.binance.com:9443/ws",
    "BINANCE_REST": "https://api.binance.com/api/v3",
    "RETRY_ATTEMPTS": 3,
    "RETRY_DELAY": 2,
    "WS_KLINE_STREAM": "btcusdt_kline_5m",
    "DATA_CACHE_MINUTES": 5,
}
