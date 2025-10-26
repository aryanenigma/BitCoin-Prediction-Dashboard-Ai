# =========================================================
# train_model.py — Easy-to-understand BTC Model Trainer
# =========================================================
# This script trains a simple AI model to predict if BTC's
# next closing price will go up (1) or down (0).
# It generates fake BTC data if no real dataset is provided.
# =========================================================

import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from joblib import dump
import sys
import os
import requests
def get_real_btc_data(limit=500):
    url = f"https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit={limit}"
    data = requests.get(url).json()
    df = pd.DataFrame([{
        "time": pd.to_datetime(k[0], unit='ms'),
        "open": float(k[1]),
        "high": float(k[2]),
        "low": float(k[3]),
        "close": float(k[4]),
        "volume": float(k[5])
    } for k in data])
    return df



# Ensure UTF-8 output (for Windows console compatibility)
sys.stdout.reconfigure(encoding='utf-8')


# =========================================================
# STEP 1: Generate fake BTC price data (if real data unavailable)
# =========================================================
def generate_fake_data(n=500):
    """
    Generates random BTC price data (open, high, low, close, volume)
    so the model can be trained even without API data.
    """
    np.random.seed(42)
    prices = np.cumsum(np.random.randn(n)) + 50000  # Simulate BTC price moves
    volume = np.abs(np.random.randn(n) * 10)         # Random trade volume

    df = pd.DataFrame({
        "time": pd.date_range("2024-01-01", periods=n, freq="H"),
        "open": prices,
        "high": prices + np.random.rand(n) * 100,
        "low": prices - np.random.rand(n) * 100,
        "close": prices + np.random.randn(n) * 50,
        "volume": volume
    })
    return df


# =========================================================
# STEP 2: Calculate RSI (Relative Strength Index)
# =========================================================
def compute_rsi(series, period=14):
    """
    RSI measures momentum. Values:
      - >70 = Overbought (may fall)
      - <30 = Oversold (may rise)
    """
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    return 100 - (100 / (1 + rs))


# =========================================================
# STEP 3: Feature Engineering
# =========================================================
def prepare_features(df):
    """
    Creates useful columns ("features") the model will learn from.
    """
    # Price returns (percentage change from previous close)
    df["return"] = df["close"].pct_change()

    # Volatility — how much price fluctuates
    df["volatility"] = df["return"].rolling(10).std()

    # RSI — market momentum indicator
    df["rsi"] = compute_rsi(df["close"])

    # Volume change — whether market activity is increasing
    df["vol_change"] = df["volume"].pct_change()

    # Sentiment (mock): positive if price is rising, negative if falling
    df["sentiment"] = df["return"].fillna(0)

    # Target variable: 1 if next candle closes higher than current, else 0
    df["target"] = (df["close"].shift(-1) > df["close"]).astype(int)

    df = df.dropna()
    return df


# =========================================================
# STEP 4: Model Training
# =========================================================
if __name__ == "__main__":
    print("🚀 [START] Training BTC model...")

    # Load (or generate) data
    df = get_real_btc_data()
    df = prepare_features(df)

    # Choose features to train on
    features = ["return", "volatility", "rsi", "vol_change", "sentiment"]
    X = df[features]
    y = df["target"]

    # Scale data — makes training more stable
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train simple logistic regression model
    model = LogisticRegression(max_iter=500)
    model.fit(X_scaled, y)

    # Save model + scaler for later use
    dump(model, "btc_model.joblib")
    dump(scaler, "btc_scaler.joblib")
    df.to_csv("training_data.csv", index=False)

    print("✅ [DONE] Model trained and saved successfully!")
