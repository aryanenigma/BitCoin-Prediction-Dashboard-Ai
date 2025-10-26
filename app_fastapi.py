# ==========================================================
# app_fastapi.py — Unified BTC AI Dashboard (Backend + Frontend)
# ==========================================================

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import subprocess, os, requests, pandas as pd, traceback, datetime as dt, numpy as np

# ---------------- APP SETUP ----------------
app = FastAPI(title="BTC AI Dashboard", version="2.3")

# ---------------- CORS ----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- DIRECTORIES ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ANALYSIS_DIR = os.path.join(BASE_DIR, "analysis")
os.makedirs(ANALYSIS_DIR, exist_ok=True)

# Serve static files (CSS, JS, images)
app.mount("/analysis", StaticFiles(directory=ANALYSIS_DIR), name="analysis")
app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")

# ---------------- FRONTEND ROUTES ----------------
@app.get("/", response_class=HTMLResponse)
def home():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/strategy", response_class=HTMLResponse)
def strategy_page():
    return FileResponse(os.path.join(BASE_DIR, "strategy.html"))

@app.get("/analytics", response_class=HTMLResponse)
def analytics_page():
    return FileResponse(os.path.join(BASE_DIR, "analytics.html"))

@app.get("/style.css")
def get_css():
    return FileResponse(os.path.join(BASE_DIR, "style.css"))

@app.get("/script.js")
def get_js():
    return FileResponse(os.path.join(BASE_DIR, "script.js"))

# ---------------- HELPER FUNCTIONS ----------------
VALID_BINANCE_INTERVALS = {
    "1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"
}

def normalize_interval(interval: str) -> str:
    if not interval:
        return "15m"
    interval = interval.strip()
    if interval in VALID_BINANCE_INTERVALS:
        return interval
    mapping = {"10m":"15m", "60m":"1h", "60":"1h", "15":"15m"}
    if interval in mapping:
        return mapping[interval]
    return "15m"

def ema(series: pd.Series, span: int):
    return series.ewm(span=span, adjust=False).mean()

def rsi(series: pd.Series, length: int = 14):
    delta = series.diff()
    up = delta.clip(lower=0)
    down = -1*delta.clip(upper=0)
    ma_up = up.ewm(alpha=1/length, adjust=False).mean()
    ma_down = down.ewm(alpha=1/length, adjust=False).mean()
    rs = ma_up / ma_down.replace(0, np.nan)
    return 100 - (100/(1+rs)).fillna(50)

# ---------------- API ENDPOINTS ----------------
@app.get("/api/combined")
def api_combined(interval: str = "15m", limit: int = 500):
    try:
        interval = normalize_interval(interval)
        url = f"https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval={interval}&limit={limit}"
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        candles = [{"time": x[0], "open": float(x[1]), "high": float(x[2]),
                    "low": float(x[3]), "close": float(x[4]), "volume": float(x[5])} for x in data]
        return {"symbol":"BTCUSDT","interval":interval,"data":candles}
    except Exception as e:
        tb = traceback.format_exc()
        return JSONResponse({"error": str(e), "traceback": tb}, status_code=500)

@app.get("/api/strategy_custom")
def strategy_custom(interval: str = "15m", limit: int = 500, profit_target_percent: float = 4.0, stop_loss_percent: float = 10.0):
    try:
        interval = normalize_interval(interval)
        url = f"https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval={interval}&limit={limit}"
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        raw = r.json()
        df = pd.DataFrame([{"time": int(k[0]//1000),"open":float(k[1]),"high":float(k[2]),"low":float(k[3]),"close":float(k[4]),"volume":float(k[5])} for k in raw])
        if df.empty or len(df)<10: return JSONResponse({"error":"Insufficient candle data"}, status_code=500)
        df["ema21"] = ema(df["close"], 21)
        df["rsi14"] = rsi(df["close"], 14)
        trades = []
        balance = 10000.0
        trades_per_day = {}
        def day_str(ts): return dt.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
        open_trade = None

        def near_recent_sr(idx, price, lookback=5, pct_threshold=0.01):
            start = max(0, idx-lookback)
            highs = df["high"].iloc[start:idx]
            lows = df["low"].iloc[start:idx]
            for h in highs: 
                if abs(price-h)/h <= pct_threshold: return True
            for l in lows:
                if abs(price-l)/l <= pct_threshold: return True
            return False

        for i in range(2,len(df)):
            row = df.iloc[i]
            prev = df.iloc[i-1]
            ds = day_str(row["time"])
            trades_today = trades_per_day.get(ds,0)

            # exit open trade
            if open_trade:
                current_price = row["close"]
                direction = open_trade["direction"]
                if direction=="LONG" and (current_price<=open_trade["stop"] or current_price>=open_trade["target"]):
                    pnl=(current_price-open_trade["entry"])/open_trade["entry"]
                    trades.append({"entry_time":open_trade["entry_time"],"exit_time":row["time"],
                                   "entry":round(open_trade["entry"],2),"exit":round(current_price,2),
                                   "pnl_percent":round(pnl*100,2),"status":"WIN" if current_price>=open_trade["target"] else "LOSS","direction":"LONG"})
                    balance*=(1+pnl); open_trade=None; continue
                if direction=="SHORT" and (current_price>=open_trade["stop"] or current_price<=open_trade["target"]):
                    pnl=(open_trade["entry"]-current_price)/open_trade["entry"]
                    trades.append({"entry_time":open_trade["entry_time"],"exit_time":row["time"],
                                   "entry":round(open_trade["entry"],2),"exit":round(current_price,2),
                                   "pnl_percent":round(pnl*100,2),"status":"WIN" if current_price<=open_trade["target"] else "LOSS","direction":"SHORT"})
                    balance*=(1+pnl); open_trade=None; continue

            # new entry
            if not open_trade and trades_today<2:
                is_prev_bear = prev["close"]<prev["open"]
                is_prev_bull = prev["close"]>prev["open"]
                is_curr_bull = row["close"]>row["open"]
                is_curr_bear = row["close"]<row["open"]
                direction = None
                entry_price = None
                if is_prev_bear and is_curr_bull and (row["close"]>prev["high"] or row["close"]>prev["close"]*1.0003):
                    direction="LONG"; entry_price=row["close"]
                elif is_prev_bull and is_curr_bear and (row["close"]<prev["low"] or row["close"]<prev["close"]*0.9997):
                    direction="SHORT"; entry_price=row["close"]
                if direction and entry_price and not near_recent_sr(i, entry_price):
                    ema21=df["ema21"].iloc[i]; rsi14=df["rsi14"].iloc[i]
                    if pd.notna(ema21) and pd.notna(rsi14):
                        if direction=="LONG":
                            sl=entry_price*(1-stop_loss_percent/100); target=entry_price*(1+profit_target_percent/100)
                        else:
                            sl=entry_price*(1+stop_loss_percent/100); target=entry_price*(1-profit_target_percent/100)
                        open_trade={"entry":entry_price,"entry_time":row["time"],"stop":sl,"target":target,"direction":direction}
                        trades_per_day[ds]=trades_today+1

        # close remaining open trade
        if open_trade:
            last=df.iloc[-1]; lp=last["close"]; direction=open_trade["direction"]
            pnl=(lp-open_trade["entry"])/open_trade["entry"] if direction=="LONG" else (open_trade["entry"]-lp)/open_trade["entry"]
            trades.append({"entry_time":open_trade["entry_time"],"exit_time":last["time"],"entry":round(open_trade["entry"],2),
                           "exit":round(lp,2),"pnl_percent":round(pnl*100,2),"status":"CLOSED","direction":direction})
            balance*=(1+pnl)

        candles_out=df[["time","open","high","low","close","volume"]].to_dict(orient="records")
        return JSONResponse({"candles":candles_out,"trades":trades,"final_balance":round(balance,2),"n_trades":len(trades)})

    except Exception as e:
        tb = traceback.format_exc()
        return JSONResponse({"error": str(e), "traceback": tb}, status_code=500)

@app.post("/api/retrain")
async def retrain_model():
    try:
        subprocess.run(["python","train_model.py"], check=True)
        subprocess.run(["python","analyze_model.py"], check=True)
        return {"message":"Model retrained successfully"}
    except subprocess.CalledProcessError as e:
        return {"error": f"Retrain failed: {str(e)}"}

@app.get("/api/refresh_visuals")
async def refresh_visuals():
    try:
        subprocess.run(["python","analyze_model.py"], check=True)
        return {"message":"Analytics refreshed successfully"}
    except subprocess.CalledProcessError as e:
        return {"error": f"Analysis generation failed: {str(e)}"}

@app.get("/api/health")
def health():
    return {"status":"ok","message":"BTC AI Dashboard running!"}

# ---------------- MAIN ----------------
if __name__=="__main__":
    import uvicorn
    uvicorn.run("app_fastapi:app", host="0.0.0.0", port=int(os.environ.get("PORT", 10000)), reload=True)

