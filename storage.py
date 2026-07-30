"""
Storage and Persistence Module (storage.py)
Manages the local SQLite database schema for logging predictions, actions,
and actual market outcomes. Also configures the unified auditing and logging pipeline.
"""

import sqlite3
import logging
import json
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
import config

# Create Logger instance
logger = logging.getLogger("TradingSignalBot")
logger.setLevel(logging.INFO)

# Avoid adding redundant handlers if they are already created
if not logger.handlers:
    # Console Handler
    c_handler = logging.StreamHandler()
    c_handler.setLevel(logging.INFO)
    
    # File Handler
    f_handler = logging.FileHandler(config.LOG_FILE)
    f_handler.setLevel(logging.INFO)
    
    # Formatter
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(filename)s:%(lineno)d] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    c_handler.setFormatter(formatter)
    f_handler.setFormatter(formatter)
    
    logger.addHandler(c_handler)
    logger.addHandler(f_handler)


def init_db() -> None:
    """
    Initializes the SQLite database and creates target schema tables if not exist.
    """
    try:
        conn = sqlite3.connect(config.DB_PATH)
        cursor = conn.cursor()
        
        # Table A: Predictions Log
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                symbol TEXT NOT NULL,
                predicted_direction INTEGER NOT NULL, -- -1: Bearish, 0: Neutral, 1: Bullish
                confidence_score REAL NOT NULL,
                features_snapshot TEXT NOT NULL,      -- JSON formatted variables
                actual_outcome INTEGER,               -- Filled retrospectively after N periods
                model_version TEXT NOT NULL
            )
        """)
        
        # Table B: Executed Simulated/Real Signals (Trades Log)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_timestamp TEXT NOT NULL,
                exit_timestamp TEXT,
                symbol TEXT NOT NULL,
                direction TEXT NOT NULL,              -- 'BUY' or 'SELL'
                entry_price REAL NOT NULL,
                exit_price REAL,
                pnl_pct REAL,                         -- Net return percentage including costs
                confidence REAL NOT NULL,
                status TEXT NOT NULL                  -- 'OPEN' or 'CLOSED'
            )
        """)
        
        # Table C: System State and Performance Metrics Cache
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS performance_metrics (
                metric_key TEXT PRIMARY KEY,
                metric_value TEXT NOT NULL,
                last_updated TEXT NOT NULL
            )
        """)
        
        conn.commit()
        conn.close()
        logger.info(f"Database successfully initialized at: {config.DB_PATH}")
    except sqlite3.Error as e:
        logger.critical(f"Failed to initialize database schema: {e}", exc_info=True)
        raise e


def log_prediction(
    symbol: str,
    predicted_direction: int,
    confidence_score: float,
    features_snapshot: Dict[str, float],
    model_version: str
) -> int:
    """
    Persists a model inference event with features snapshot to the database.
    """
    try:
        conn = sqlite3.connect(config.DB_PATH)
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        feat_json = json.dumps(features_snapshot)
        
        cursor.execute("""
            INSERT INTO predictions 
            (timestamp, symbol, predicted_direction, confidence_score, features_snapshot, actual_outcome, model_version)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (now, symbol, predicted_direction, confidence_score, feat_json, None, model_version))
        
        inserted_id = cursor.lastrowid or 0
        conn.commit()
        conn.close()
        logger.info(f"Log prediction success (ID: {inserted_id}) -> Pred:{predicted_direction} Conf:{confidence_score:.2%}")
        return inserted_id
    except sqlite3.Error as e:
        logger.error(f"Failed to log prediction event: {e}", exc_info=True)
        return -1


def update_prediction_outcome(prediction_id: int, actual_outcome: int) -> None:
    """
    Updates the historical prediction entry retrospectively once target horizon spans.
    """
    try:
        conn = sqlite3.connect(config.DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE predictions
            SET actual_outcome = ?
            WHERE id = ?
        """, (actual_outcome, prediction_id))
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        logger.error(f"Failed to update prediction outcome (ID: {prediction_id}): {e}", exc_info=True)


def log_trade_entry(
    symbol: str,
    direction: str,
    entry_price: float,
    confidence: float
) -> int:
    """
    Logs trade opening details into the database.
    """
    try:
        conn = sqlite3.connect(config.DB_PATH)
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            INSERT INTO trades 
            (entry_timestamp, exit_timestamp, symbol, direction, entry_price, exit_price, pnl_pct, confidence, status)
            VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?, ?)
        """, (now, symbol, direction, entry_price, confidence, "OPEN"))
        
        inserted_id = cursor.lastrowid or 0
        conn.commit()
        conn.close()
        logger.info(f"Logged trade ENTRY (ID: {inserted_id}) -> {direction} @ {entry_price:.2f}")
        return inserted_id
    except sqlite3.Error as e:
        logger.error(f"Failed to log trade entry: {e}", exc_info=True)
        return -1


def log_trade_exit(
    trade_id: int,
    exit_price: float,
    pnl_pct: float
) -> None:
    """
    Logs critical trade closing details (exit price, net PnL).
    """
    try:
        conn = sqlite3.connect(config.DB_PATH)
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            UPDATE trades 
            SET exit_timestamp = ?, exit_price = ?, pnl_pct = ?, status = ?
            WHERE id = ?
        """, (now, exit_price, pnl_pct, "CLOSED", trade_id))
        
        conn.commit()
        conn.close()
        logger.info(f"Logged trade EXIT (ID: {trade_id}) -> ExitPrice:{exit_price:.2f} PnL:{pnl_pct:.2%}")
    except sqlite3.Error as e:
        logger.error(f"Failed to log trade exit for ID {trade_id}: {e}", exc_info=True)


def get_all_logged_predictions() -> List[Tuple]:
    """Retrieves all predictions logged in the database."""
    try:
        conn = sqlite3.connect(config.DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM predictions ORDER BY id DESC")
        rows = cursor.fetchall()
        conn.close()
        return rows
    except sqlite3.Error as e:
        logger.error(f"Failed to fetch predictions: {e}")
        return []


def get_all_logged_trades() -> List[Tuple]:
    """Retrieves all executed trades logged in the database."""
    try:
        conn = sqlite3.connect(config.DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades ORDER BY id DESC")
        rows = cursor.fetchall()
        conn.close()
        return rows
    except sqlite3.Error as e:
        logger.error(f"Failed to fetch executed trades: {e}")
        return []
