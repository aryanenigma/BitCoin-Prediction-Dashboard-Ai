# ==========================================================
# app_fastapi.py — Unified BTC AI Dashboard (Backend + Frontend)
# ==========================================================

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import os
import requests
import pandas as pd

app = FastAPI(title="BTC AI Dashboard")

# ---------------- CORS SETTINGS ----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- STATIC FILES ----------------
# Serve CSS, JS, images, and analysis charts
if not os.path.exists("analysis"):
    os.makedirs("analysis")

app.mount("/analysis", StaticFiles(directory="analysis"), name="analysis")
app.mount("/static", StaticFiles(directory="."), name="static")

# ---------------- FRONTEND ROUTES ----------------
@app.get("/", response_class=HTMLResponse)
def home():
    """Main Dashboard Page"""
    return FileResponse("index.html")

@app.get("/strategy", response_class=HTMLResponse)
def strategy_page():
    """Trading Strategy Page"""
    return FileResponse("strategy.html")

@app.get("/analytics", response_class=HTMLResponse)
def analytics_page():
    """Model Analytics Page"""
    return FileResponse("analytics.html")

@app.get("/style.css")
def get_css():
    return FileResponse("style.css")

@app.get("/script.js")
def get_js():
    return FileResponse("script.js")


# ---------------- API ENDPOINTS ----------------
@app.get("/api/combined")
def api_combined(interval: str = "15m", limit: int = 500):
    """Fetch recent BTC/USDT data from Binance"""
    try:
        url = f"https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval={interval}&limit={limit}"
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        if not isinstance(data, list):
            return {"error": "Invalid response"}
        candles = [
            {
                "time": x[0],
                "open": float(x[1]),
                "high": float(x[2]),
                "low": float(x[3]),
                "close": float(x[4]),
                "volume": float(x[5]),
            }
            for x in data
        ]
        return {"symbol": "BTCUSDT", "interval": interval, "data": candles}
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/retrain")
async def retrain_model():
    """Retrain AI model"""
    try:
        subprocess.run(["python", "train_model.py"], check=True)
        subprocess.run(["python", "analyze_model.py"], check=True)
        return {"message": "Model retrained successfully"}
    except subprocess.CalledProcessError as e:
        return {"error": f"Retrain failed: {str(e)}"}


@app.get("/api/refresh_visuals")
async def refresh_visuals():
    """Regenerate analytics charts"""
    try:
        subprocess.run(["python", "analyze_model.py"], check=True)
        return {"message": "Analytics refreshed successfully"}
    except subprocess.CalledProcessError as e:
        return {"error": f"Analysis generation failed: {str(e)}"}


@app.get("/api/health")
def health():
    """Health check for Render"""
    return {"status": "ok", "message": "BTC AI Dashboard running!"}


# ---------------- MAIN ----------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=10000)
