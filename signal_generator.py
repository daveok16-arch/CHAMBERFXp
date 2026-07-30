"""
Multi-Timeframe Signal Generator & Risk Filter (signal_generator.py)
Consolidates raw Machine Learning forecasts, volatility regime levels,
and macro-trend states to produce risk-filtered trade signals.
"""

from typing import Dict, Any, Tuple
import config
from storage import logger


class SignalGenerator:
    def __init__(self):
        self.conf_threshold: float = config.TRADING_CONFIG["CONFIDENCE_THRESHOLD"]
        self.regime_filter: bool = config.TRADING_CONFIG["REGIME_FILTER_ENABLED"]

    def classify_regime(self, adx: float, atr: float, close: float) -> str:
        """
        Classifies the current market state into one of two regimes:
          - 'TRENDING': strong directional pushes.
          - 'RANGE_BOUND': mean-reverting tight horizontal channels.
          
        Standard rules: ADX > 25 indicates a strong trend; ADX < 18 indicates a range.
        Standardizes volatility ratio if needed, using ATR percentage of close.
        """
        atr_pct = atr / close if close > 0 else 0
        
        # Determine regime based on Trend Strength Index (ADX)
        if adx >= 25.0:
            return "TRENDING"
        elif adx < 18.0:
            return "RANGE_BOUND"
        else:
            # Borderline states: support with ATR volatility evaluation
            if atr_pct > 0.015:  # High relative visual range expansion
                return "TRENDING"
            return "RANGE_BOUND"

    def validate_confirmation(
        self,
        predicted_direction: int,
        feature_row: Dict[str, float]
    ) -> bool:
        """
        Requires that the local prediction direction matches higher macro trend.
        Checks 'macro_1h_trend' and 'macro_4h_trend' values logged in features (1: Bullish, -1: Bearish).
        """
        m1_trend = feature_row.get("macro_1h_trend", 0.0)
        m2_trend = feature_row.get("macro_4h_trend", 0.0)
        
        # Strict Multi-Timeframe Checks:
        # Bullish predictions (1) require macro trend to be bullish or flat
        # Bearish predictions (-1) require macro trend to be bearish or flat
        if predicted_direction == 1:
            if m1_trend < 0 or m2_trend < 0:
                logger.info("Signal rejected: Bullish prediction conflicts with higher timeframe trends.")
                return False
        elif predicted_direction == -1:
            if m1_trend > 0 or m2_trend > 0:
                logger.info("Signal rejected: Bearish prediction conflicts with higher timeframe trends.")
                return False
                
        return True

    def evaluate_signal(
        self,
        predicted_direction: int,
        confidence: float,
        feature_row: Dict[str, float]
    ) -> Tuple[str, str]:
        """
        Evaluates predictions against confidence limits, volatility regimes,
        and multi-timeframe confirmation rules.
        
        Outputs: (action, reason)
          action: 'BUY', 'SELL', or 'HOLD'
          reason: explanatory descriptive string
        """
        close = feature_row.get("close", 0.0)
        adx = feature_row.get("adx", 0.0)
        atr = feature_row.get("atr", 0.0)
        
        # 1. Prediction direction check
        if predicted_direction == 0:
            return "HOLD", "Model predicted neutral horizontal price action."

        # 2. Confidence Thresholding
        if confidence < self.conf_threshold:
            return "HOLD", f"Confidence ({confidence:.1%}) below limit ({self.conf_threshold:.1%})."

        # 3. Market Regime Filter
        regime = self.classify_regime(adx, atr, close)
        
        if self.regime_filter:
            # Trend signals thrive in a trending market.
            # If the market is highly range-bound, we restrict trend-following breakout calls.
            if regime == "RANGE_BOUND":
                # Check momentum metrics to see if it's an extreme oversold bounds rejection
                rsi = feature_row.get("rsi", 50.0)
                # Allow a signal in range-bound only if RSI suggests an extreme mean-reversion opportunity
                if predicted_direction == 1 and rsi > 40:
                    return "HOLD", "Range-bound regime: Bullish signal rejected (RSI is not oversold)."
                elif predicted_direction == -1 and rsi < 60:
                    return "HOLD", "Range-bound regime: Bearish signal rejected (RSI is not overbought)."

        # 4. Multi-Timeframe Confirmation
        is_confirmed = self.validate_confirmation(predicted_direction, feature_row)
        if not is_confirmed:
            return "HOLD", "Macro multi-timeframe direction confirmation failed."

        # Passed all checks! Issue signal
        action = "BUY" if predicted_direction == 1 else "SELL"
        reason = f"Confirmed {regime} setups with confidence {confidence:.1%}"
        
        logger.warning(f"⭐⭐ SIGNAL GENERATED: {action} on {config.TRADING_CONFIG['SYMBOL']} -> {reason}")
        return action, reason
