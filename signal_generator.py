"""
Enhanced Signal Generator (signal_generator.py)
Smart multi-criteria signal generation with dynamic thresholds,
regime-aware entry/exit rules, and institutional-grade risk filters.
"""

from typing import Dict, Any, Tuple, Optional
import numpy as np
import config
from storage import logger


class SignalGenerator:
    def __init__(self):
        self.conf_threshold = config.TRADING_CONFIG["CONFIDENCE_THRESHOLD"]
        self.regime_filter = config.TRADING_CONFIG["REGIME_FILTER_ENABLED"]
        
        # Dynamic threshold parameters
        self.rsi_oversold = 30
        self.rsi_overbought = 70
        self.rsi_neutral_low = 40
        self.rsi_neutral_high = 60
        
    def classify_regime(self, adx: float, atr: float, close: float) -> str:
        """Classifies market regime: TRENDING, RANGING, or VOLATILE."""
        atr_pct = atr / close if close > 0 else 0
        
        if atr_pct > 0.025:
            return "VOLATILE"
        elif adx >= 25.0:
            return "TRENDING"
        elif adx < 18.0:
            return "RANGING"
        else:
            return "TRENDING" if atr_pct > 0.015 else "RANGING"
    
    def calculate_signal_score(
        self,
        predicted_direction: int,
        confidence: float,
        features: Dict[str, float]
    ) -> float:
        """
        Calculates composite signal score (0-100) based on multiple factors.
        Higher score = stronger signal.
        """
        score = 0.0
        
        # Base score from ML confidence
        score += confidence * 40
        
        # RSI contribution
        rsi = features.get("rsi", 50)
        if predicted_direction == 1:  # Bullish
            if rsi < 30:
                score += 15  # Oversold - strong buy signal
            elif rsi < 40:
                score += 10  # Near oversold
            elif rsi < 60:
                score += 5   # Neutral territory
        elif predicted_direction == -1:  # Bearish
            if rsi > 70:
                score += 15  # Overbought - strong sell signal
            elif rsi > 60:
                score += 10
            elif rsi > 40:
                score += 5
        
        # Trend alignment bonus
        trend_strength = features.get("trend_strength", 0)
        if predicted_direction == 1 and trend_strength > 0:
            score += min(15, trend_strength * 15)
        elif predicted_direction == -1 and trend_strength < 0:
            score += min(15, abs(trend_strength) * 15)
        
        # ADX strength bonus (trend confirmation)
        adx = features.get("adx", 0)
        if adx > 25:
            score += 10
        elif adx > 20:
            score += 5
        
        # Multi-timeframe alignment bonus
        mtf_score = features.get("mtf_bull_score", 0)
        if predicted_direction == 1 and mtf_score > 0:
            score += mtf_score * 10
        elif predicted_direction == -1 and mtf_score < 0:
            score += abs(mtf_score) * 10
        
        # Volume confirmation
        vol_ratio = features.get("volume_ratio", 1)
        if vol_ratio > 1.5:
            score += 5
        
        return min(100, max(0, score))
    
    def validate_multi_timeframe(
        self,
        predicted_direction: int,
        features: Dict[str, float]
    ) -> Tuple[bool, str]:
        """
        Validates signal against higher timeframe trends.
        Returns (is_valid, reason)
        """
        m1_trend = features.get("macro_1h_trend", 0)
        m4_trend = features.get("macro_4h_trend", 0)
        
        if predicted_direction == 1:  # Bullish
            # Require at least one higher timeframe to be bullish
            if m1_trend < 0 and m4_trend < 0:
                return False, "Bearish macro trend conflict on 1h and 4h"
            if m1_trend < 0 and m4_trend == 0:
                return False, "Bearish 1h trend conflict"
            if m4_trend < 0 and m1_trend == 0:
                return False, "Bearish 4h trend conflict"
        elif predicted_direction == -1:  # Bearish
            if m1_trend > 0 and m4_trend > 0:
                return False, "Bullish macro trend conflict on 1h and 4h"
            if m1_trend > 0 and m4_trend == 0:
                return False, "Bullish 1h trend conflict"
            if m4_trend > 0 and m1_trend == 0:
                return False, "Bullish 4h trend conflict"
        
        return True, "Multi-timeframe confirmed"
    
    def apply_regime_filters(
        self,
        action: str,
        features: Dict[str, float],
        regime: str
    ) -> Tuple[str, str]:
        """
        Applies regime-specific filters to signal.
        Returns (action, reason) - may change action to HOLD.
        """
        rsi = features.get("rsi", 50)
        adx = features.get("adx", 0)
        
        if regime == "RANGING":
            # In ranging markets, only trade mean reversion at extremes
            if action == "BUY":
                if rsi > self.rsi_neutral_low:
                    return "HOLD", f"Range-bound: RSI ({rsi:.1f}) not oversold enough for buy"
                logger.info("Range-bound buy accepted at oversold level")
            elif action == "SELL":
                if rsi < self.rsi_neutral_high:
                    return "HOLD", f"Range-bound: RSI ({rsi:.1f}) not overbought enough for sell"
                logger.info("Range-bound sell accepted at overbought level")
                
        elif regime == "VOLATILE":
            # In volatile markets, require extra confirmation
            if features.get("volume_ratio", 1) < 1.2:
                return "HOLD", "Volatile market: Insufficient volume confirmation"
            if adx < 30:
                return "HOLD", "Volatile market: Weak trend, avoiding"
        
        elif regime == "TRENDING":
            # In trending markets, allow signals aligned with trend
            mtf_score = features.get("mtf_bull_score", 0)
            if action == "BUY" and mtf_score < 0:
                return "HOLD", "Trending market: Signal conflicts with macro trend"
            if action == "SELL" and mtf_score > 0:
                return "HOLD", "Trending market: Signal conflicts with macro trend"
        
        return action, "Regime filter passed"
    
    def evaluate_signal(
        self,
        predicted_direction: int,
        confidence: float,
        features: Dict[str, float]
    ) -> Tuple[str, str]:
        """
        Comprehensive signal evaluation.
        Returns (action, reason)
        action: BUY, SELL, or HOLD
        """
        close = features.get("close", 0)
        adx = features.get("adx", 0)
        atr = features.get("atr", 0)
        
        # Step 1: Check for neutral prediction
        if predicted_direction == 0:
            return "HOLD", "Model predicted neutral horizontal price action"
        
        # Step 2: Confidence threshold
        if confidence < self.conf_threshold:
            return "HOLD", f"Confidence ({confidence:.1%}) below threshold ({self.conf_threshold:.1%})"
        
        # Step 3: Calculate composite signal score
        score = self.calculate_signal_score(predicted_direction, confidence, features)
        
        # Require minimum score for signal
        min_score = 55
        if score < min_score:
            return "HOLD", f"Composite signal score ({score:.0f}) below minimum ({min_score})"
        
        # Step 4: Determine regime
        regime = self.classify_regime(adx, atr, close)
        logger.info(f"Market regime detected: {regime}")
        
        # Step 5: Multi-timeframe confirmation
        is_valid, reason = self.validate_multi_timeframe(predicted_direction, features)
        if not is_valid:
            return "HOLD", f"Multi-timeframe validation failed: {reason}"
        
        # Step 6: Determine initial action
        action = "BUY" if predicted_direction == 1 else "SELL"
        
        # Step 7: Apply regime-specific filters
        action, reason = self.apply_regime_filters(action, features, regime)
        if action == "HOLD":
            return action, reason
        
        # Step 8: Additional momentum filters
        macd_hist = features.get("macd_hist", 0)
        stoch_k = features.get("stoch_k", 50)
        
        if action == "BUY":
            # Require bullish momentum
            if macd_hist < 0 and score < 70:
                return "HOLD", "Weak momentum: MACD histogram bearish"
            if stoch_k > 80 and score < 75:
                return "HOLD", "Overbought: Stochastic rejecting at high levels"
        else:  # SELL
            if macd_hist > 0 and score < 70:
                return "HOLD", "Weak momentum: MACD histogram bullish"
            if stoch_k < 20 and score < 75:
                return "HOLD", "Oversold: Stochastic rejecting at low levels"
        
        # All checks passed
        logger.warning(f"SIGNAL GENERATED: {action} on {config.TRADING_CONFIG['SYMBOL']}")
        logger.warning(f"  Score: {score:.0f}/100, Confidence: {confidence:.1%}, Regime: {regime}")
        
        reason = f"Confirmed {regime} setup | Score: {score:.0f} | Conf: {confidence:.1%}"
        return action, reason
    
    def get_stop_loss_tp(
        self,
        action: str,
        entry_price: float,
        atr: float,
        features: Dict[str, float]
    ) -> Tuple[float, float, float]:
        """
        Calculates stop loss, take profit, and recommended entry.
        Returns (entry, stop_loss, take_profit)
        """
        close = features.get("close", entry_price)
        atr_pct = atr / close if close > 0 else 0.005
        
        # Dynamic ATR multiplier based on regime
        regime = self.classify_regime(
            features.get("adx", 25),
            atr,
            close
        )
        
        if regime == "TRENDING":
            sl_mult = 1.5
            tp_mult = 3.0
        elif regime == "VOLATILE":
            sl_mult = 2.5
            tp_mult = 2.0
        else:  # RANGING
            sl_mult = 1.0
            tp_mult = 2.0
        
        if action == "BUY":
            stop_loss = entry_price * (1 - atr_pct * sl_mult)
            take_profit = entry_price * (1 + atr_pct * tp_mult)
        else:  # SELL
            stop_loss = entry_price * (1 + atr_pct * sl_mult)
            take_profit = entry_price * (1 - atr_pct * tp_mult)
        
        # Ensure minimum R:R of 1:2
        risk = abs(entry_price - stop_loss)
        potential_reward = abs(take_profit - entry_price)
        
        if potential_reward < risk * 2:
            # Adjust take profit to maintain 1:2 R:R
            if action == "BUY":
                take_profit = entry_price + risk * 2
            else:
                take_profit = entry_price - risk * 2
        
        return entry_price, stop_loss, take_profit
