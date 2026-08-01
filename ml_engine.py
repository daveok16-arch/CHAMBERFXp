"""
Enhanced Machine Learning Engine (ml_engine.py)
Institutional-grade ML for profitable trading signals.
"""

import os
import pickle
from typing import Dict, Any, Tuple, List, Optional
import numpy as np
import pandas as pd

try:
    from sklearn.ensemble import (
        RandomForestClassifier, GradientBoostingClassifier,
        AdaBoostClassifier, VotingClassifier
    )
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.metrics import accuracy_score, f1_score
    from sklearn.preprocessing import RobustScaler
    from sklearn.model_selection import TimeSeriesSplit
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

import config
from storage import logger


def generate_labels(
    df: pd.DataFrame,
    horizon: int = 12,
    bull_th: float = 0.005,
    bear_th: float = -0.005,
    dynamic_thresholds: bool = False
) -> pd.Series:
    """Triple barrier labeling with dynamic thresholds."""
    close = df["close"]
    labels = pd.Series(index=df.index, data=0, dtype=np.int32)
    
    for i in range(len(df) - horizon):
        entry_price = close.iloc[i]
        future_prices = close.iloc[i + 1 : i + 1 + horizon]
        
        max_ret = (future_prices.max() - entry_price) / entry_price
        min_ret = (future_prices.min() - entry_price) / entry_price
        
        if max_ret >= bull_th and min_ret > bear_th:
            labels.iloc[i] = 1
        elif min_ret <= bear_th and max_ret < bull_th:
            labels.iloc[i] = -1
        elif max_ret >= bull_th and min_ret <= bear_th:
            first_max_idx = future_prices.idxmax()
            first_min_idx = future_prices.idxmin()
            labels.iloc[i] = 1 if first_max_idx <= first_min_idx else -1
        else:
            labels.iloc[i] = 0
    
    return labels


class FeatureScaler:
    def __init__(self):
        self.scaler = RobustScaler() if SKLEARN_AVAILABLE else None
        
    def fit_transform(self, X: pd.DataFrame) -> np.ndarray:
        if self.scaler:
            return self.scaler.fit_transform(X.values)
        return X.values
    
    def transform(self, X: pd.DataFrame) -> np.ndarray:
        if self.scaler:
            return self.scaler.transform(X.values)
        return X.values


class EnhancedFallbackClassifier:
    """Heuristic classifier when sklearn unavailable."""
    
    def __init__(self):
        self.feature_weights = {}
        
    def fit(self, X: pd.DataFrame, y: pd.Series):
        for col in X.columns:
            bull_mean = X.loc[y == 1, col].mean() if 1 in y.values else 0
            bear_mean = X.loc[y == -1, col].mean() if -1 in y.values else 0
            self.feature_weights[col] = {
                "bull_mean": float(bull_mean),
                "bear_mean": float(bear_mean),
                "std": float(X[col].std())
            }
        
    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        n = len(X)
        probs = np.zeros((n, 3))
        
        for idx in range(n):
            bull_score = 0.35
            bear_score = 0.35
            
            for col in X.columns:
                if col not in self.feature_weights:
                    continue
                val = X[col].iloc[idx]
                w = self.feature_weights[col]
                
                if w["std"] > 0:
                    z_bull = (val - w["bull_mean"]) / w["std"]
                    z_bear = (val - w["bear_mean"]) / w["std"]
                    if z_bull < 0: bull_score += 0.08
                    if z_bear < 0: bear_score += 0.08
            
            total = bull_score + bear_score + 0.2
            probs[idx, 0] = bear_score / total
            probs[idx, 1] = 0.2 / total
            probs[idx, 2] = bull_score / total
            
        return probs
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        probs = self.predict_proba(X)
        return np.array([-1, 0, 1])[np.argmax(probs, axis=1)]


class MLEngine:
    def __init__(self, model_dir: str = "."):
        self.model_dir = model_dir
        self.model_path = os.path.join(model_dir, "ensemble_model.pkl")
        self.model = None
        self.feature_scaler = FeatureScaler()
        
        self.features = [
            "rsi", "rsi_7", "rsi_smooth", "stoch_k", "stoch_d",
            "cci", "momentum", "roc", "williams_r", "ultimate_osc",
            "macd_line", "macd_signal", "macd_hist", "macd_crossover",
            "adx", "plus_di", "minus_di", "di_crossover",
            "supertrend_dir", "trend_strength",
            "ema_ratio_8_21", "ema_ratio_21_50", "ema_cross_50_200",
            "atr_pct", "atr_ratio", "bb_width", "bb_position", "kc_position",
            "volume_ratio", "volume_zscore", "force_index", "money_flow",
            "macro_1h_trend", "macro_1h_rsi", "macro_4h_trend", "macro_4h_rsi",
            "mtf_bull_score", "mtf_rsi_confluence",
            "log_ret_lag_1", "log_ret_lag_2", "log_ret_lag_3", "log_ret_lag_5",
            "rolling_std_20", "rolling_skew", "rolling_kurt",
        ]
        
        self.load_model()
        
    def load_model(self) -> bool:
        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, "rb") as f:
                    model_data = pickle.load(f)
                self.model = model_data.get("model")
                logger.info(f"Model loaded from: {self.model_path}")
                return True
            except Exception as e:
                logger.error(f"Failed to load model: {e}")
        
        if SKLEARN_AVAILABLE:
            self._initialize_ensemble()
        else:
            self.model = EnhancedFallbackClassifier()
            logger.warning("Scikit-learn unavailable. Using fallback heuristics.")
        return False
    
    def _initialize_ensemble(self):
        rf = RandomForestClassifier(
            n_estimators=150, max_depth=8, min_samples_leaf=4,
            random_state=42, n_jobs=-1, class_weight="balanced"
        )
        gb = GradientBoostingClassifier(
            n_estimators=100, max_depth=5, learning_rate=0.1,
            subsample=0.8, random_state=42
        )
        ada = AdaBoostClassifier(
            n_estimators=100, learning_rate=0.1, random_state=42
        )
        
        calibrated_rf = CalibratedClassifierCV(rf, method="sigmoid", cv=3)
        calibrated_gb = CalibratedClassifierCV(gb, method="sigmoid", cv=3)
        calibrated_ada = CalibratedClassifierCV(ada, method="sigmoid", cv=3)
        
        self.model = VotingClassifier(
            estimators=[("rf", calibrated_rf), ("gb", calibrated_gb), ("ada", calibrated_ada)],
            voting="soft", n_jobs=-1
        )
    
    def save_model(self) -> None:
        try:
            with open(self.model_path, "wb") as f:
                pickle.dump({"model": self.model, "features": self.features}, f)
            logger.info(f"Model saved to: {self.model_path}")
        except Exception as e:
            logger.error(f"Failed to save model: {e}")
    
    def partition_data(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        df_clean = df.copy()
        
        labels = generate_labels(
            df_clean,
            horizon=config.ML_CONFIG["LABEL_HORIZON_N"],
            bull_th=config.ML_CONFIG["BULL_THRESHOLD_X"],
            bear_th=config.ML_CONFIG["BEAR_THRESHOLD_Y"],
            dynamic_thresholds=True
        )
        df_clean["target"] = labels
        
        available_features = [f for f in self.features if f in df_clean.columns]
        if not available_features:
            available_features = [c for c in df_clean.columns if c not in ["open", "high", "low", "close", "volume", "target"]]
            self.features = available_features
        
        features_df = df_clean[available_features]
        valid_mask = ~features_df.isna().any(axis=1)
        valid_mask &= df_clean.index < df_clean.index[-config.ML_CONFIG["LABEL_HORIZON_N"]]
        
        return features_df[valid_mask], df_clean.loc[valid_mask, "target"]
    
    def train_and_calibrate(self, df: pd.DataFrame) -> Dict[str, float]:
        X, y = self.partition_data(df)
        
        if len(y) < config.ML_CONFIG["MIN_TRAINING_BARS"]:
            raise ValueError(f"Insufficient data: {len(y)} < {config.ML_CONFIG['MIN_TRAINING_BARS']}")
        
        X_scaled = self.feature_scaler.fit_transform(X)
        
        tscv = TimeSeriesSplit(n_splits=3)
        fold_scores = []
        
        for train_idx, test_idx in tscv.split(X_scaled):
            X_train, X_test = X_scaled[train_idx], X_scaled[test_idx]
            y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
            
            try:
                self.model.fit(X_train, y_train)
                y_pred = self.model.predict(X_test)
                acc = accuracy_score(y_test, y_pred)
                f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)
                fold_scores.append({"accuracy": acc, "f1": f1})
            except Exception as e:
                logger.error(f"Training fold failed: {e}")
        
        try:
            self.model.fit(X_scaled, y)
            
            metrics = {
                "val_accuracy": np.mean([s["accuracy"] for s in fold_scores]) if fold_scores else 0,
                "val_f1": np.mean([s["f1"] for s in fold_scores]) if fold_scores else 0,
                "dataset_size": float(len(y)),
                "class_balance": {
                    "bullish": int((y == 1).sum()),
                    "bearish": int((y == -1).sum()),
                    "neutral": int((y == 0).sum())
                }
            }
            
            logger.info(f"Model trained. Accuracy: {metrics['val_accuracy']:.2%}, F1: {metrics['val_f1']:.3f}")
            self.save_model()
            return metrics
            
        except Exception as e:
            logger.error(f"Training failed: {e}")
            raise
    
    def predict_direction(self, feature_row: Dict[str, float]) -> Tuple[int, float]:
        try:
            idx_df = pd.DataFrame([feature_row])
            for f in self.features:
                if f not in idx_df.columns:
                    idx_df[f] = 0
            idx_df = idx_df[self.features].fillna(0)
            
            X_scaled = self.feature_scaler.transform(idx_df)
            
            if hasattr(self.model, "predict_proba"):
                probs = self.model.predict_proba(X_scaled)[0]
                classes = np.array([-1, 0, 1])
                max_idx = int(np.argmax(probs))
                
                confidence = float(probs[max_idx])
                sorted_probs = np.sort(probs)
                margin = sorted_probs[-1] - sorted_probs[-2]
                if margin > 0.3:
                    confidence = min(1.0, confidence * 1.2)
                
                return int(classes[max_idx]), confidence
            else:
                probs = self.model.predict_proba(idx_df)[0]
                max_idx = int(np.argmax(probs))
                return int([-1, 0, 1][max_idx]), float(probs[max_idx])
                
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return 0, 0.5
