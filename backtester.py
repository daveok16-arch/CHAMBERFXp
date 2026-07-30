"""
Historical Backtester (backtester.py)
Vectorized and event-driven backtesting engine to evaluate model performance on
historical candle feeds. Incorporates realistic transaction costs, execution slip,
and spread, with strict isolation to ensure zero future-looking bias.
"""

from typing import Dict, Any, List, Tuple
import numpy as np
import pandas as pd
import config
from storage import logger


class HistoricalBacktester:
    def __init__(self, df: pd.DataFrame):
        """
        Expects df to contain all engineered features, alignment indices, and closes.
        """
        self.df = df.copy().sort_index()
        self.transaction_fee = config.TRADING_CONFIG["TRANSACTION_COST"]
        self.slippage_pct = config.TRADING_CONFIG["SLIPPAGE_PCT"]
        self.spread_pct = config.TRADING_CONFIG["BID_ASK_SPREAD"]

    def run_backtest(
        self,
        signals: pd.Series,
        confidences: pd.Series
    ) -> Dict[str, Any]:
        """
        Executes mock trade entries and exits based on decision signals (BUY, SELL, HOLD).
        Signals is a series with index matching self.df, values: 'BUY', 'SELL', 'HOLD'.
        
        Tracks equity balances and computes high-precision risk metrics.
        """
        prices = self.df["close"].values
        timestamps = self.df.index
        
        signal_vals = signals.values
        conf_vals = confidences.values
        
        equity = 10000.0  # Initial portfolio balance (USD)
        position = 0.0    # 1.0 for Long, -1.0 for Short, 0.0 for Flat
        entry_price = 0.0
        trade_count = 0
        wins = 0
        total_pnl = 0.0
        
        # Lists for tracking
        equity_curve: List[float] = []
        trade_logs: List[Dict[str, Any]] = []
        returns_list: List[float] = []
        
        prev_equity = equity
        
        for i in range(len(self.df)):
            current_price = prices[i]
            sig = signal_vals[i]
            conf = conf_vals[i]
            ts = timestamps[i]
            
            # Close/adjust open state if signal shifts
            if position != 0.0:
                # Calculate running return
                if position == 1.0:
                    trade_pct = (current_price - entry_price) / entry_price
                else:
                    trade_pct = (entry_price - current_price) / entry_price
                
                # Exit trigger: Signal dictates a reversal or stop
                should_exit = (position == 1.0 and sig == "SELL") or \
                              (position == -1.0 and sig == "BUY") or \
                              (sig == "HOLD") or \
                              (i == len(self.df) - 1)  # Force exit at dataset tail
                              
                if should_exit:
                    # Formulate execution slippage & fees
                    fees_and_slip = self.transaction_fee + self.slippage_pct + (self.spread_pct / 2)
                    net_trade_pct = trade_pct - fees_and_slip
                    
                    trade_profit = prev_equity * net_trade_pct
                    equity += trade_profit
                    trade_count += 1
                    
                    if net_trade_pct > 0:
                        wins += 1
                        
                    total_pnl += trade_profit
                    returns_list.append(net_trade_pct)
                    
                    trade_logs.append({
                        "entry_time": str(timestamps[i - 1]),
                        "exit_time": str(ts),
                        "direction": "LONG" if position == 1.0 else "SHORT",
                        "entry_price": float(entry_price),
                        "exit_price": float(current_price),
                        "pnl_pct": float(net_trade_pct),
                        "net_pnl_usd": float(trade_profit),
                        "confidence": float(conf)
                    })
                    
                    # Reset states
                    position = 0.0
                    entry_price = 0.0
            
            # Entry logic if flat
            if position == 0.0 and i < len(self.df) - 1:
                if sig == "BUY":
                    position = 1.0
                    fees_and_slip = self.transaction_fee + self.slippage_pct + (self.spread_pct / 2)
                    entry_price = current_price * (1 + fees_and_slip)
                    prev_equity = equity
                elif sig == "SELL":
                    position = -1.0
                    fees_and_slip = self.transaction_fee + self.slippage_pct + (self.spread_pct / 2)
                    entry_price = current_price * (1 - fees_and_slip)
                    prev_equity = equity
                    
            equity_curve.append(equity)
            
        # Standardize return arrays
        pnl_series = pd.Series(returns_list)
        equity_series = pd.Series(equity_curve)
        
        # Financial metric formulas
        total_return = (equity - 10000.0) / 10000.0
        win_rate = wins / trade_count if trade_count > 0 else 0.0
        
        # Profit Factor
        gains = pnl_series[pnl_series > 0].sum()
        losses = abs(pnl_series[pnl_series < 0].sum())
        profit_factor = gains / losses if losses > 0 else (1.0 if gains > 0 else 0.0)
        
        # Sharpe & Sortino ratios (assuming risk-free asset yield is 0.0)
        daily_std = pnl_series.std()
        mean_ret = pnl_series.mean()
        
        # Annualized Sharpe (assuming 252 trading sessions representing standard crypto 24/7 velocity)
        sharpe_ratio = (mean_ret / daily_std) * np.sqrt(252) if daily_std > 0 else 0.0
        
        downside_std = pnl_series[pnl_series < 0].std()
        sortino_ratio = (mean_ret / downside_std) * np.sqrt(252) if downside_std > 0 else 0.0
        
        # Maximum Drawdown
        rolling_max = equity_series.cummax()
        drawdowns = (equity_series - rolling_max) / rolling_max
        max_drawdown = float(drawdowns.min())
        
        metrics = {
            "initial_balance": 10000.0,
            "final_balance": float(equity),
            "total_return_pct": float(total_return),
            "trade_count": trade_count,
            "win_rate": float(win_rate),
            "profit_factor": float(profit_factor),
            "sharpe_ratio": float(sharpe_ratio),
            "sortino_ratio": float(sortino_ratio),
            "max_drawdown": float(max_drawdown),
            "equity_curve": equity_curve,
            "trades": trade_logs
        }
        
        logger.info(f"Backtester Completed -> Total Trades: {trade_count}, Net Return: {total_return:.2%}, Max DD: {max_drawdown:.2%}")
        return metrics


def calculate_classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_probs: np.ndarray
) -> Dict[str, float]:
    """
    Computes professional quantitative metrics like precision, recall, F1, and Brier accuracy score
    to analyze the probability calibration quality of predictions.
    """
    metrics = {}
    
    # Accuracy
    correct_preds = (y_true == y_pred)
    metrics["accuracy"] = float(np.mean(correct_preds))
    
    # Class-wise precision
    for cls in [-1, 0, 1]:
        cls_name = "neutral" if cls == 0 else ("bullish" if cls == 1 else "bearish")
        
        # Handle precision
        pred_mask = (y_pred == cls)
        true_mask = (y_true == cls)
        
        true_pos = np.sum(pred_mask & true_mask)
        predicted_total = np.sum(pred_mask)
        actual_total = np.sum(true_mask)
        
        precision = true_pos / predicted_total if predicted_total > 0 else 0.0
        recall = true_pos / actual_total if actual_total > 0 else 0.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        
        metrics[f"{cls_name}_precision"] = float(precision)
        metrics[f"{cls_name}_recall"] = float(recall)
        metrics[f"{cls_name}_f1"] = float(f1)
        
    # Brier score calculation for probability calibration accuracy
    # Brier score evaluates mean squared error of probability predictions
    # We binarize true directions to calculate Brier Score for each classes
    brier_scores = []
    classes_list = [-1, 0, 1]
    
    for idx, cls in enumerate(classes_list):
        true_binary = (y_true == cls).astype(float)
        # Handle shape safety
        if y_probs.shape[1] > idx:
            pred_probs = y_probs[:, idx]
            brier_score = float(np.mean((true_binary - pred_probs) ** 2))
            brier_scores.append(brier_score)
            
    metrics["brier_score_mean"] = float(np.mean(brier_scores)) if brier_scores else 0.0
    
    return metrics
