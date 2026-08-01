"""
Enhanced Backtester (backtester.py)
Professional backtesting with Monte Carlo simulation, walk-forward analysis,
regime-specific performance, and comprehensive risk metrics.
"""

from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
import config
from storage import logger


class EnhancedBacktester:
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy().sort_index()
        self.fee = config.TRADING_CONFIG["TRANSACTION_COST"]
        self.slippage = config.TRADING_CONFIG["SLIPPAGE_PCT"]
        self.spread = config.TRADING_CONFIG["BID_ASK_SPREAD"]
        
    def run_backtest(
        self,
        signals: pd.Series,
        confidences: pd.Series,
        initial_balance: float = 10000.0
    ) -> Dict[str, Any]:
        """Run comprehensive backtest with full metrics."""
        prices = self.df["close"].values
        equity = initial_balance
        position = 0.0
        entry_price = 0.0
        entry_idx = 0
        
        equity_curve = []
        trades = []
        returns_list = []
        wins = 0
        losses = 0
        
        for i in range(len(self.df)):
            sig = signals.iloc[i] if i < len(signals) else "HOLD"
            conf = confidences.iloc[i] if i < len(confidences) else 0
            
            # Exit logic
            if position != 0:
                if position == 1.0:
                    trade_ret = (prices[i] - entry_price) / entry_price
                else:
                    trade_ret = (entry_price - prices[i]) / entry_price
                
                should_exit = (position == 1 and sig == "SELL") or                              (position == -1 and sig == "BUY") or                              (sig == "HOLD") or (i == len(self.df) - 1)
                
                if should_exit:
                    costs = self.fee + self.slippage + self.spread / 2
                    net_ret = trade_ret - costs
                    
                    trade_profit = equity * net_ret
                    equity += trade_profit
                    
                    if net_ret > 0:
                        wins += 1
                    else:
                        losses += 1
                    
                    returns_list.append(net_ret)
                    
                    trades.append({
                        "entry_idx": entry_idx,
                        "exit_idx": i,
                        "direction": "LONG" if position == 1 else "SHORT",
                        "entry_price": entry_price,
                        "exit_price": prices[i],
                        "net_return": net_ret,
                        "pnl": trade_profit,
                        "confidence": conf
                    })
                    
                    position = 0
                    entry_price = 0
            
            # Entry logic
            if position == 0 and i < len(self.df) - 1:
                if sig == "BUY":
                    position = 1.0
                    costs = self.fee + self.slippage + self.spread / 2
                    entry_price = prices[i] * (1 + costs)
                    entry_idx = i
                elif sig == "SELL":
                    position = -1.0
                    costs = self.fee + self.slippage + self.spread / 2
                    entry_price = prices[i] * (1 - costs)
                    entry_idx = i
            
            equity_curve.append(equity)
        
        return self._calculate_metrics(equity_curve, trades, returns_list, wins, losses)
    
    def walk_forward_test(
        self,
        signals: pd.Series,
        confidences: pd.Series,
        train_size: int = 1000,
        test_size: int = 200
    ) -> Dict[str, Any]:
        """Walk-forward analysis to prevent overfitting."""
        results = []
        i = 0
        
        while i + train_size + test_size <= len(self.df):
            train_df = self.df.iloc[i:i+train_size]
            test_df = self.df.iloc[i+train_size:i+train_size+test_size]
            
            test_signals = signals.iloc[i+train_size:i+train_size+test_size]
            test_confidences = confidences.iloc[i+train_size:i+train_size+test_size]
            
            bt = EnhancedBacktester(test_df)
            metrics = bt.run_backtest(test_signals, test_confidences)
            metrics["window_start"] = i
            metrics["window_end"] = i + train_size + test_size
            
            results.append(metrics)
            i += test_size
        
        # Aggregate results
        if not results:
            return {}
        
        return {
            "windows": results,
            "avg_return": np.mean([r["total_return"] for r in results]),
            "avg_win_rate": np.mean([r["win_rate"] for r in results]),
            "avg_sharpe": np.mean([r["sharpe_ratio"] for r in results]),
            "consistency": np.mean([1 if r["total_return"] > 0 else 0 for r in results])
        }
    
    def monte_carlo_simulation(
        self,
        trades: List[Dict],
        n_simulations: int = 1000,
        initial_balance: float = 10000.0
    ) -> Dict[str, Any]:
        """Monte Carlo simulation for robustness testing."""
        if not trades:
            return {}
        
        returns = [t["net_return"] for t in trades]
        equity_curves = []
        
        for _ in range(n_simulations):
            equity = initial_balance
            curve = [equity]
            
            for ret in returns:
                if np.random.random() > 0.1:  # 90% trade survival
                    equity *= (1 + ret)
                curve.append(equity)
            
            equity_curves.append(equity)
        
        equity_curves = sorted(equity_curves)
        
        return {
            "median_equity": np.median(equity_curves),
            "percentile_5": equity_curves[int(n_simulations * 0.05)],
            "percentile_95": equity_curves[int(n_simulations * 0.95)],
            "max_loss": min(equity_curves) - initial_balance,
            "max_win": max(equity_curves) - initial_balance,
            "probability_of_profit": sum(1 for e in equity_curves if e > initial_balance) / n_simulations
        }
    
    def regime_specific_performance(
        self,
        signals: pd.Series,
        confidences: pd.Series,
        regime_column: str = "market_regime"
    ) -> Dict[str, Dict[str, Any]]:
        """Analyze performance by market regime."""
        regimes = self.df[regime_column].unique()
        results = {}
        
        for regime in regimes:
            if pd.isna(regime):
                continue
                
            mask = self.df[regime_column] == regime
            regime_df = self.df[mask]
            
            if len(regime_df) < 50:
                continue
            
            regime_signals = signals[mask]
            regime_confidences = confidences[mask]
            
            bt = EnhancedBacktester(regime_df)
            results[str(regime)] = bt.run_backtest(regime_signals, regime_confidences)
        
        return results
    
    def _calculate_metrics(
        self,
        equity_curve: List[float],
        trades: List[Dict],
        returns_list: List[float],
        wins: int,
        losses: int
    ) -> Dict[str, Any]:
        """Calculate comprehensive performance metrics."""
        equity_series = pd.Series(equity_curve)
        returns_series = pd.Series(returns_list)
        
        total_return = (equity_curve[-1] - equity_curve[0]) / equity_curve[0]
        n_trades = len(trades)
        win_rate = wins / n_trades if n_trades > 0 else 0
        
        # Profit factor
        gross_profit = sum(r for r in returns_list if r > 0)
        gross_loss = abs(sum(r for r in returns_list if r < 0))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0
        
        # Risk metrics
        equity_series.index = range(len(equity_series))
        rolling_max = equity_series.cummax()
        drawdowns = (equity_series - rolling_max) / rolling_max
        max_drawdown = drawdowns.min()
        
        # Sharpe & Sortino
        if len(returns_list) > 1:
            mean_ret = returns_series.mean()
            std_ret = returns_series.std()
            downside_returns = returns_series[returns_series < 0]
            
            sharpe = (mean_ret / std_ret) * np.sqrt(252) if std_ret > 0 else 0
            sortino = (mean_ret / downside_returns.std()) * np.sqrt(252) if len(downside_returns) > 0 else 0
        else:
            sharpe = sortino = 0
        
        # Expectancy
        expectancy = (win_rate * (gross_profit / max(wins, 1))) -                     ((1 - win_rate) * (gross_loss / max(losses, 1))) if n_trades > 0 else 0
        
        return {
            "initial_balance": equity_curve[0],
            "final_balance": equity_curve[-1],
            "total_return": total_return,
            "trade_count": n_trades,
            "wins": wins,
            "losses": losses,
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "sharpe_ratio": sharpe,
            "sortino_ratio": sortino,
            "max_drawdown": max_drawdown,
            "expectancy": expectancy,
            "avg_win": gross_profit / max(wins, 1) if wins > 0 else 0,
            "avg_loss": gross_loss / max(losses, 1) if losses > 0 else 0,
            "equity_curve": equity_curve,
            "trades": trades
        }


def calculate_classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_probs: np.ndarray
) -> Dict[str, float]:
    """Calculate classification quality metrics."""
    metrics = {}
    
    correct = (y_true == y_pred)
    metrics["accuracy"] = float(np.mean(correct))
    
    for cls in [-1, 0, 1]:
        cls_name = {-1: "bearish", 0: "neutral", 1: "bullish"}[cls]
        
        pred_mask = (y_pred == cls)
        true_mask = (y_true == cls)
        
        tp = np.sum(pred_mask & true_mask)
        fp = np.sum(pred_mask & ~true_mask)
        fn = np.sum(~pred_mask & true_mask)
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
        
        metrics[f"{cls_name}_precision"] = float(precision)
        metrics[f"{cls_name}_recall"] = float(recall)
        metrics[f"{cls_name}_f1"] = float(f1)
    
    # Brier score
    brier_scores = []
    for idx, cls in enumerate([-1, 0, 1]):
        true_binary = (y_true == cls).astype(float)
        if y_probs.shape[1] > idx:
            brier = np.mean((true_binary - y_probs[:, idx]) ** 2)
            brier_scores.append(brier)
    
    metrics["brier_score"] = float(np.mean(brier_scores)) if brier_scores else 0
    
    return metrics
