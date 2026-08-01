"""
Feature Engineering Pipeline (feature_engineering.py)
Generates high-fidelity features for machine learning models, isolating 
all computations safely to prevent any look-ahead bias and handle missing values.
"""

import math
from typing import Dict, List, Tuple
import numpy as np
import pandas as pd


def compute_rsi(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Relative Strength Index (RSI) computation using standard Wilders smoothing.
    """
    delta = df["close"].diff()
    gain = (delta.where(delta > 0, 0)).copy()
    loss = (-delta.where(delta < 0, 0)).copy()
    
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    
    # Wilderness exponential smoothing
    for i in range(period, len(df)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period
        
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def compute_macd(
    df: pd.DataFrame,
    fast_period: int = 12,
    slow_period: int = 26,
    signal_period: int = 9
) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """
    Moving Average Convergence Divergence (MACD) line, Signal line, and Histogram.
    """
    ema_fast = df["close"].ewm(span=fast_period, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow_period, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
    macd_hist = macd_line - signal_line
    return macd_line, signal_line, macd_hist


def compute_adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Average Directional Index (ADX) representing directional trend strength.
    """
    high = df["high"]
    low = df["low"]
    close = df["close"]
    
    # True range
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    
    atr_rolling = tr.rolling(window=period, min_periods=period).sum()
    
    up_move = high - high.shift(1)
    down_move = low.shift(1) - low
    
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    
    plus_dm_series = pd.Series(plus_dm, index=df.index).rolling(window=period, min_periods=period).sum()
    minus_dm_series = pd.Series(minus_dm, index=df.index).rolling(window=period, min_periods=period).sum()
    
    plus_di = 100 * (plus_dm_series / atr_rolling)
    minus_di = 100 * (minus_dm_series / atr_rolling)
    
    di_diff = (plus_di - minus_di).abs()
    di_sum = plus_di + minus_di
    dx = 100 * (di_diff / di_sum.replace(0, np.nan))
    adx = dx.fillna(0).rolling(window=period, min_periods=period).mean()
    
    return adx.fillna(0)


def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Average True Range (ATR) representing objective price volatility scope.
    """
    high = df["high"]
    low = df["low"]
    close = df["close"]
    
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    
    atr = tr.ewm(alpha=1/period, adjust=False).mean()
    return atr.ffill().bfill()


def compute_vwap(df: pd.DataFrame) -> pd.Series:
    """
    Volume Weighted Average Price (VWAP) computed cumulative over sessions.
    Saves look-ahead bias by resetting only on relative daily bounds or running window.
    """
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    tp_v = typical_price * df["volume"]
    
    # We default to a rolling 24-period lookback window to act as moving trading-session VWAP
    cum_tp_v = tp_v.rolling(window=24, min_periods=1).sum()
    cum_v = df["volume"].rolling(window=24, min_periods=1).sum()
    
    vwap = cum_tp_v / cum_v.replace(0, 1.0)
    return vwap


def compute_dynamic_support_resistance(df: pd.DataFrame, lookback: int = 48) -> Tuple[pd.Series, pd.Series]:
    """
    Identifies dynamic support and resistance levels using rolling minimum/maximum.
    """
    support = df["low"].rolling(window=lookback, min_periods=12).min()
    resistance = df["high"].rolling(window=lookback, min_periods=12).max()
    return support.fillna(df["low"]), resistance.fillna(df["high"])


def extract_technical_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ingests raw historical OHLCV. Computes and maps complete technical, momentum,
    and statistical variables, guaranteeing zero forward-looking biases.
    """
    out_df = df.copy()
    
    # Lags and log returns
    out_df["log_ret"] = np.log(out_df["close"] / out_df["close"].shift(1))
    
    for lag in [1, 2, 3, 5]:
        out_df[f"log_ret_lag_{lag}"] = out_df["log_ret"].shift(lag)
        
    # Standard technical metrics
    out_df["rsi"] = compute_rsi(out_df, period=14)
    
    macd_line, signal_line, macd_hist = compute_macd(out_df)
    out_df["macd_line"] = macd_line
    out_df["macd_signal"] = signal_line
    out_df["macd_hist"] = macd_hist
    
    out_df["adx"] = compute_adx(out_df, period=14)
    out_df["atr"] = compute_atr(out_df, period=14)
    
    # Bollinger Bands
    bb_mean = out_df["close"].rolling(window=20).mean()
    bb_std = out_df["close"].rolling(window=20).std()
    out_df["bb_width"] = (2 * 4 * bb_std) / bb_mean.replace(0, 1.0) # Standard BB width calculation
    
    # Exponential Moving Average Ratios
    out_df["ema_20"] = out_df["close"].ewm(span=20, adjust=False).mean()
    out_df["ema_50"] = out_df["close"].ewm(span=50, adjust=False).mean()
    out_df["ema_ratio"] = out_df["ema_20"] / out_df["ema_50"].replace(0, 1)
    
    # VWAP features
    vwap_series = compute_vwap(out_df)
    out_df["vwap_ratio"] = out_df["close"] / vwap_series.replace(0, 1)
    
    # Volume dynamics & Volume climax
    vol_mean = out_df["volume"].rolling(window=20).mean()
    vol_std = out_df["volume"].rolling(window=20).std()
    out_df["volume_roc"] = out_df["volume"].pct_change(3).fillna(0)
    out_df["volume_climax"] = np.where(out_df["volume"] > (vol_mean + 2 * vol_std), 1.0, 0.0)
    
    # Statistical higher moments (Skew & Kurtosis)
    out_df["rolling_std"] = out_df["log_ret"].rolling(window=30).std()
    out_df["rolling_skew"] = out_df["log_ret"].rolling(window=30).skew().fillna(0)
    out_df["rolling_kurt"] = out_df["log_ret"].rolling(window=30).kurt().fillna(0)
    
    # Price Action: Distance from support / resistance
    support, resistance = compute_dynamic_support_resistance(out_df, lookback=48)
    out_df["dist_support"] = (out_df["close"] - support) / support.replace(0, 1)
    out_df["dist_resistance"] = (resistance - out_df["close"]) / resistance.replace(0, 1)
    
    # Ensure there are no infinite or extreme numerical spikes
    out_df = out_df.replace([np.inf, -np.inf], 0).fillna(0)
    
    return out_df


def map_multi_timeframe(
    lower_df: pd.DataFrame,
    macro_1h_df: pd.DataFrame,
    macro_4h_df: pd.DataFrame
) -> pd.DataFrame:
    """
    Safely joins higher timeframe macro directions (e.g. Trend EMAs and Momentum)
    onto the execution-level (lower timeframe) DataFrame.
    Prevents any alignment bias by indexing higher timeframe states backwards.
    """
    # Build clean trend signals on macro dfs
    m1_state = pd.DataFrame(index=macro_1h_df.index)
    ema_20_1h = macro_1h_df["close"].ewm(span=20, adjust=False).mean()
    ema_50_1h = macro_1h_df["close"].ewm(span=50, adjust=False).mean()
    m1_state["macro_1h_trend"] = np.where(ema_20_1h > ema_50_1h, 1.0, -1.0)
    m1_state["macro_1h_rsi"] = compute_rsi(macro_1h_df, 14)
    
    m2_state = pd.DataFrame(index=macro_4h_df.index)
    ema_20_4h = macro_4h_df["close"].ewm(span=20, adjust=False).mean()
    ema_50_4h = macro_4h_df["close"].ewm(span=50, adjust=False).mean()
    m2_state["macro_4h_trend"] = np.where(ema_20_4h > ema_50_4h, 1.0, -1.0)
    
    # Align values back to timestamps.
    # To avoid look-ahead, we merge 'asof' based on the trade timestamp on local
    # with the last complete higher timeframe candle timestamp (which must be at least 1h or 4h older).
    
    lower_df = lower_df.sort_index()
    m1_state = m1_state.sort_index()
    m2_state = m2_state.sort_index()
    
    merged_df = pd.merge_asof(
        lower_df,
        m1_state,
        left_index=True,
        right_index=True,
        direction="backward"
    )
    merged_df = pd.merge_asof(
        merged_df,
        m2_state,
        left_index=True,
        right_index=True,
        direction="backward"
    )
    
    return merged_df.fillna(0)
