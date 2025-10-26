// ======================================================
// script.js — Final Stable Version (BTC AI Dashboard + Custom Strategy)
// ======================================================

const API_BASE = "http://127.0.0.1:8000";
let chart = null;
let candleSeries = null;
const currentPage = window.location.pathname.split("/").pop();

// ---------- COMMON UTILITIES ----------
function setLoading(state, btn, label = "Loading...") {
  if (!btn) return;
  btn.disabled = state;
  btn.dataset.label = btn.dataset.label || btn.textContent;
  btn.textContent = state ? label : btn.dataset.label;
}

function formatUSD(value) {
  if (value === null || value === undefined || isNaN(Number(value))) return "-";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function safeGet(id) {
  return document.getElementById(id);
}

function parseTimeValue(t) {
  if (t === null || t === undefined) return null;
  if (typeof t === "string" && /^\d+$/.test(t)) t = Number(t);
  if (typeof t === "number") {
    if (t > 1e12) return Math.floor(t / 1000);
    return Math.floor(t);
  }
  const parsed = Date.parse(t);
  return isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

// ======================================================
// 🧭 RESPONSIVE NAVBAR (Works on phone & laptop)
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".topbar");
  if (!nav) return;

  // Add toggle button for small screens
  const toggle = document.createElement("button");
  toggle.innerHTML = "☰";
  toggle.className = "nav-toggle";
  toggle.style.cssText =
    "background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;margin-left:8px;";
  const navlinks = nav.querySelector(".navlinks");
  nav.insertBefore(toggle, navlinks);

  toggle.addEventListener("click", () => {
    navlinks.classList.toggle("show");
  });

  // hide nav when clicking outside (on mobile)
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) navlinks.classList.remove("show");
  });
});

// ======================================================
// 1️⃣ DASHBOARD PAGE — BTC Price + Sentiment Forecast
// ======================================================
// ======================================================
// DASHBOARD — Live BTC Chart + Sentiment + News (Fixed Timeframe)
// ======================================================
// ======================================================
// DASHBOARD — Live BTC Chart + Sentiment + News Cards
// ======================================================
async function initDashboard() {
  const chartEl = safeGet("chart");
  const refreshBtn = safeGet("refresh-ai");
  const forecastBar = safeGet("forecast-fill");
  const forecastText = safeGet("forecast-text");
  const trendEl = safeGet("trend-breaks");
  const newsEl = safeGet("news-container");
  const lastPriceEl = safeGet("last-price");

  if (!chartEl) return;

  // === Timeframe selector ===
  const tfWrap = document.createElement("div");
  tfWrap.style.margin = "8px 0";
  tfWrap.innerHTML = `
    <label for="tf-select" style="color:#22d3ee;font-weight:500;margin-right:6px;">
      ⏱ Timeframe:
    </label>
    <select id="tf-select" style="background:#0b1220;color:#22d3ee;border:1px solid #1f2937;border-radius:8px;padding:4px 8px;">
      <option value="1m">1m</option>
      <option value="5m">5m</option>
      <option value="15m" selected>15m</option>
      <option value="1h">1h</option>
    </select>
  `;
  chartEl.parentNode.insertBefore(tfWrap, chartEl);

  const tfSelect = safeGet("tf-select");

  // === Setup chart ===
  const chart = LightweightCharts.createChart(chartEl, {
    width: chartEl.clientWidth,
    height: 400,
    layout: { background: { color: "#0b1220" }, textColor: "#e5e7eb" },
    grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
      borderVisible: false,
    },
  });

  const candleSeries = chart.addCandlestickSeries({
    upColor: "#16a34a",
    downColor: "#dc2626",
    borderUpColor: "#16a34a",
    borderDownColor: "#dc2626",
    wickUpColor: "#16a34a",
    wickDownColor: "#dc2626",
  });

  // === Fetch chart + news data ===
  async function fetchData() {
    const interval = tfSelect.value;
    setLoading(true, refreshBtn, "Refreshing...");
    try {
      const resp = await fetch(`${API_BASE}/api/combined?interval=${interval}&limit=300`);
      const data = await resp.json();
      if (!data.candles) throw new Error(data.error || "No candle data");

      // format times correctly (seconds for Lightweight Charts)
      const candles = data.candles.map(c => ({
        time: Math.floor(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(candles);

      const last = candles.at(-1);
      if (last && lastPriceEl)
        lastPriceEl.textContent = `BTC (${interval.toUpperCase()}): ${formatUSD(last.close)}`;

      // === Update sentiment ===
      const sentiment = data.news_agg || { score: 0, label: "neutral" };
      updateSentiment(sentiment);

      // === News Section (show top 5) ===
      if (newsEl) {
        const list = data.news || [];
        if (!list.length) {
          newsEl.innerHTML = "<div class='muted'>No recent BTC news available.</div>";
        } else {
          const topNews = list.slice(0, 5);
          newsEl.innerHTML = topNews
            .map(n => {
              const color =
                n.sentiment === "positive"
                  ? "#16a34a"
                  : n.sentiment === "negative"
                  ? "#dc2626"
                  : "#6b7280";
              const emoji =
                n.sentiment === "positive"
                  ? "🟢"
                  : n.sentiment === "negative"
                  ? "🔴"
                  : "⚪";
              const barWidth = (Math.random() * 100).toFixed(1);
              return `
                <div class="news-card">
                  <div class="news-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-weight:600;color:${color};">${emoji} ${n.sentiment.toUpperCase()}</span>
                    <span style="font-size:12px;color:#9ca3af;">BTC News</span>
                  </div>
                  <a href="${n.link}" target="_blank" style="color:#e5e7eb;text-decoration:none;font-weight:500;display:block;margin-bottom:6px;">
                    ${n.title}
                  </a>
                  <div class="sentiment-bar" style="height:6px;width:100%;background:#1f2937;border-radius:4px;overflow:hidden;">
                    <div style="height:6px;width:${barWidth}%;background:${color};border-radius:4px;"></div>
                  </div>
                </div>`;
            })
            .join("");
        }
      }
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false, refreshBtn, "Refresh");
    }
  }

  // === Update sentiment visual ===
  function updateSentiment(sent) {
    const s = sent.score || 0;
    const dir = s > 0.05 ? "rise" : s < -0.05 ? "fall" : "stable";
    const pct = Math.min(100, Math.abs(s * 100)).toFixed(1);

    if (dir === "rise") {
      forecastBar.style.width = `${pct}%`;
      forecastBar.style.background = "linear-gradient(90deg,#00ff88,#06b6d4)";
      forecastText.textContent = `Market may RISE by ~${pct}% (positive sentiment)`;
      trendEl.textContent = "🟢 Positive News Mood";
    } else if (dir === "fall") {
      forecastBar.style.width = `${pct}%`;
      forecastBar.style.background = "linear-gradient(90deg,#ef4444,#b91c1c)";
      forecastText.textContent = `Market may FALL by ~${pct}% (negative sentiment)`;
      trendEl.textContent = "🔴 Negative News Mood";
    } else {
      forecastBar.style.width = "50%";
      forecastBar.style.background = "linear-gradient(90deg,#9ca3af,#6b7280)";
      forecastText.textContent = `Market likely STABLE (neutral news)`;
      trendEl.textContent = "⚪ Neutral";
    }
  }

  // === Events ===
  if (refreshBtn) refreshBtn.addEventListener("click", fetchData);
  if (tfSelect) tfSelect.addEventListener("change", fetchData);
  window.addEventListener("resize", () =>
    chart.applyOptions({ width: chartEl.clientWidth })
  );

  await fetchData();
  setInterval(fetchData, 60000); // auto refresh every 1 min
}

// ======================================================
// 2️⃣ STRATEGY PAGE — Smart BTC Breakout Strategy
// ======================================================
async function initStrategyPage() {
  const btn = safeGet("simulate-btn");
  const status = safeGet("sim-status");
  const chartContainer = safeGet("strategy-chart");
  const rsiContainer = safeGet("rsi-chart");
  const tableWrap = safeGet("strategy-trades-table");

  if (!btn) return;

  btn.addEventListener("click", async () => {
    setLoading(true, btn, "Running simulation...");
    status.textContent = "Simulating Smart BTC Breakout Strategy...";

    try {
      const resp = await fetch(`${API_BASE}/api/strategy_custom?interval=10m&limit=500`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      safeGet("sim-initial").textContent = formatUSD(data.initial_balance);
      safeGet("sim-final").textContent = formatUSD(data.final_balance);
      safeGet("sim-return").textContent = `${data.total_return_percent}%`;
      safeGet("sim-trades").textContent = data.n_trades;
      safeGet("sim-win").textContent = `${data.win_rate_percent}%`;
      status.textContent = "✅ Strategy Simulation Complete!";

      // ---- Main Candle Chart ----
      chartContainer.innerHTML = "";
      chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: 320,
        layout: { background: { color: "#0b1220" }, textColor: "#e5e7eb" },
        timeScale: { timeVisible: true, secondsVisible: false },
      });
      candleSeries = chart.addCandlestickSeries();
      const candles = data.candles.map((c) => ({
        time: parseTimeValue(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(candles);

      // ---- RSI Subchart ----
      rsiContainer.innerHTML = "";
      const rsiChart = LightweightCharts.createChart(rsiContainer, {
        width: rsiContainer.clientWidth,
        height: 120,
        layout: { background: { color: "#0b1220" }, textColor: "#e5e7eb" },
        timeScale: { visible: true },
      });
      const rsiSeries = rsiChart.addLineSeries({ color: "#00ff88", lineWidth: 1.5 });
      const rsiVals = computeRsi(candles.map((c) => c.close), 14);
      const times = candles.map((c) => c.time);
      const rsiPoints = rsiVals.map((v, i) => ({ time: times[i], value: v })).filter((v) => v.value);
      rsiSeries.setData(rsiPoints);

      // ---- Trade Markers ----
      const markers = [];
      data.trades.forEach((t) => {
        markers.push({
          time: t.entry_time,
          position: "belowBar",
          color: t.direction === "LONG" ? "green" : "red",
          shape: "arrowUp",
          text: `ENTRY ${t.direction}`,
        });
        markers.push({
          time: t.exit_time,
          position: "aboveBar",
          color: t.status === "WIN" ? "#00ff88" : "#ef4444",
          shape: "arrowDown",
          text: `${t.status} ${t.pnl_percent}%`,
        });
      });
      candleSeries.setMarkers(markers);

      // ---- Trades Table ----
      if (!data.trades.length) {
        tableWrap.innerHTML = "<div class='muted'>No trades simulated.</div>";
      } else {
        const rows = data.trades
          .map((t) => {
            const et = new Date(t.entry_time * 1000).toLocaleString();
            const xt = new Date(t.exit_time * 1000).toLocaleString();
            const color = t.status === "WIN" ? "win" : "loss";
            return `
              <tr>
                <td>${et}</td>
                <td>${formatUSD(t.entry)}</td>
                <td>${formatUSD(t.exit)}</td>
                <td class="${color}">${t.pnl_percent}%</td>
                <td>${t.status}</td>
                <td>${t.direction}</td>
              </tr>`;
          })
          .join("");
        tableWrap.innerHTML = `
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr><th>Entry Time</th><th>Entry</th><th>Exit</th><th>PnL%</th><th>Status</th><th>Dir</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>`;
      }
    } catch (err) {
      console.error("Simulation error:", err);
      status.textContent = "❌ Simulation failed.";
    } finally {
      setLoading(false, btn, "Run Simulation");
    }
  });
}
async function loadProjection() {
  try {
    const resp = await fetch(`${API_BASE}/api/strategy_projection?interval=15m&limit=500`);
    const data = await resp.json();
    const sum = data.summary || {};
    const chartContainer = safeGet("projection-chart");
    const summaryEl = safeGet("projection-summary");

    if (!data.signals?.length) {
      summaryEl.textContent = "No projection signals found.";
      return;
    }

    summaryEl.innerHTML = `
      <strong>Total Signals:</strong> ${sum.total_signals}<br>
      <strong>Win Rate:</strong> ${sum.win_rate}%<br>
      <strong>Average Profit per Trade:</strong> ${sum.avg_pnl_per_trade}%<br>
      <strong>Total Strategy Gain:</strong> ${sum.total_pnl_percent}%<br>
    `;

    const chart = LightweightCharts.createChart(chartContainer, {
      width: chartContainer.clientWidth,
      height: 180,
      layout: { background: { color: "#0b1220" }, textColor: "#e5e7eb" },
      rightPriceScale: { visible: true },
      timeScale: { timeVisible: true, borderVisible: false },
    });

    const profitSeries = chart.addHistogramSeries({
      color: "#16a34a",
      negativeColor: "#dc2626",
      base: 0,
    });

    const profitData = data.signals.map(s => ({
      time: s.time,
      value: s.pnl_percent,
      color: s.pnl_percent >= 0 ? "#16a34a" : "#dc2626",
    }));

    profitSeries.setData(profitData);
  } catch (err) {
    console.error("Projection error:", err);
  }
}
loadProjection();

// ---- RSI Calculation ----
function computeRsi(closes, length = 14) {
  const deltas = [];
  for (let i = 1; i < closes.length; i++) deltas.push(closes[i] - closes[i - 1]);
  let seed = deltas.slice(0, length);
  let up = 0, down = 0;
  seed.forEach((d) => { if (d >= 0) up += d; else down += Math.abs(d); });
  up /= length; down /= length;
  let rs = up / (down === 0 ? 1 : down);
  const rsi = [];
  for (let i = 0; i <= length; i++) rsi.push(null);
  let avgUp = up, avgDown = down;
  for (let i = length; i < deltas.length; i++) {
    const d = deltas[i];
    if (d >= 0) {
      avgUp = (avgUp * (length - 1) + d) / length;
      avgDown = (avgDown * (length - 1)) / length;
    } else {
      avgUp = (avgUp * (length - 1)) / length;
      avgDown = (avgDown * (length - 1) + Math.abs(d)) / length;
    }
    rs = avgUp / (avgDown === 0 ? 1 : avgDown);
    rsi.push(100 - 100 / (1 + rs));
  }
  while (rsi.length < closes.length) rsi.unshift(null);
  return rsi;
}

// ======================================================
// 3️⃣ ANALYTICS PAGE — Retrain + Refresh Visuals
// ======================================================
async function initAnalyticsPage() {
  const retrainBtn = safeGet("retrain-btn");
  const refreshBtn = safeGet("refresh-visuals");
  const status = safeGet("retrain-status");
  const featureImg = safeGet("img-feature");
  const sentimentImg = safeGet("img-sentiment");

  function updateImages() {
    const ts = Date.now();
    if (featureImg)
      featureImg.src = `${API_BASE}/analysis/feature_importance.png?ts=${ts}`;
    if (sentimentImg)
      sentimentImg.src = `${API_BASE}/analysis/sentiment_correlation.png?ts=${ts}`;
  }

  if (retrainBtn) {
    retrainBtn.addEventListener("click", async () => {
      status.textContent = "⏳ Retraining model...";
      retrainBtn.disabled = true;
      try {
        const resp = await fetch(`${API_BASE}/api/retrain`, { method: "POST" });
        const data = await resp.json();
        status.textContent = data.status === "success"
          ? "✅ Retraining started successfully."
          : "⚠️ Retraining failed: " + (data.message || "Error");
      } catch (err) {
        status.textContent = "❌ Error retraining: " + err.message;
      } finally {
        retrainBtn.disabled = false;
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      status.textContent = "🔄 Refreshing visuals...";
      refreshBtn.disabled = true;
      try {
        const resp = await fetch(`${API_BASE}/api/refresh_visuals`, { method: "POST" });
        const data = await resp.json();
        if (data.status === "success") {
          status.textContent = "✅ Visuals refreshed!";
          updateImages();
        } else {
          status.textContent = "⚠️ Refresh failed: " + (data.message || "Unknown error");
        }
      } catch (err) {
        status.textContent = "❌ Refresh error: " + err.message;
      } finally {
        refreshBtn.disabled = false;
      }
    });
  }

  updateImages();
}

// ======================================================
// INIT PAGE BASED ON ROUTE
// ======================================================
if (["index.html", "", "index"].includes(currentPage)) initDashboard();
else if (["strategy.html", "strategy"].includes(currentPage)) initStrategyPage();
else if (["analytics.html", "analytics"].includes(currentPage)) initAnalyticsPage();
