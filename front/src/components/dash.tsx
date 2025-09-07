// src/components/dash.tsx
import React, { useEffect, useRef, useState, type JSX } from "react";
import axios from "axios";

interface Asset { asset: string; qty: number; type: string; }
interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number; }

const AVAILABLE_ASSETS = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "adausdt"] as const;
type AssetKey = typeof AVAILABLE_ASSETS[number];
const INTERVALS = ["30s", "1m", "5m", "10m", "30m"] as const;
type IntervalKey = typeof INTERVALS[number];

// IMPORTANT: match the DECIMALS you used when inserting to timescale (you used 8 earlier)
const SCALE = 1e8;

const intervalToMs = (interval: IntervalKey) => {
  if (interval === "30s") return 30_000;
  if (interval === "1m") return 60_000;
  if (interval === "5m") return 300_000;
  if (interval === "10m") return 600_000;
  if (interval === "30m") return 1_800_000;
  return 60_000;
};
const getBucketStart = (ts: number, interval: IntervalKey) => Math.floor(ts / intervalToMs(interval)) * intervalToMs(interval);

export default function Dash(): JSX.Element {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

  const [candles, setCandles] = useState<Candle[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string>(AVAILABLE_ASSETS[0]);
  const [selectedInterval, setSelectedInterval] = useState<IntervalKey>("1m");
  const [limit, setLimit] = useState<number>(100);

  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);

  // ---------- Helpers ----------
  const parseNumber = (v: any) => {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  };

  // If value is huge ( > 1e6 ) assume it's stored scaled by SCALE (1e8) and downscale.
  const normalizePrice = (raw: any) => {
    const n = parseNumber(raw);
    if (!Number.isFinite(n)) return NaN;
    return n > 1_000_000 ? n / SCALE : n;
  };

  const formatPrice = (p: number, decimals = 2) => {
    // choose decimals based on magnitude
    if (!Number.isFinite(p)) return "-";
    const d = decimals >= 0 ? decimals : 2;
    return p.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  // ---------- Chart rendering ----------
  const drawChart = (data: Candle[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = Math.max(1, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 320;
    canvas.width = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // background
    ctx.fillStyle = "#0f1113";
    ctx.fillRect(0, 0, cssW, cssH);

    if (!data.length) {
      ctx.fillStyle = "#999";
      ctx.font = "14px sans-serif";
      ctx.fillText("No candle data", 10, 20);
      return;
    }

    // prices
    const highs = data.map((c) => c.high);
    const lows = data.map((c) => c.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const pad = (maxPrice - minPrice) * 0.06 || (maxPrice * 0.01) || 1;
    const top = maxPrice + pad;
    const bottom = minPrice - pad;
    const priceRange = top - bottom || 1;

    // layout
    const margin = 12;
    const rightAxisWidth = 70; // space for price labels
    const bottomAxisHeight = 28; // space for time labels
    const innerLeft = margin;
    const innerTop = margin;
    const innerW = cssW - margin * 2 - rightAxisWidth;
    const innerH = cssH - margin * 2 - bottomAxisHeight;

    // candle sizing
    const candleW = Math.max(4, Math.floor(innerW / data.length * 0.65));
    const spacing = Math.max(1, Math.floor(innerW / data.length - candleW));

    // grid lines & axis background
    ctx.strokeStyle = "#1f2224";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = innerTop + (innerH / 4) * i;
      ctx.moveTo(innerLeft, y - 0.5);
      ctx.lineTo(innerLeft + innerW, y - 0.5);
    }
    ctx.stroke();

    // Y labels (right side)
    ctx.fillStyle = "#bfc7cb";
    ctx.font = "12px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const yTickCount = 5;
    // dynamic decimals based on price range
    const dynDecimals = Math.max(0, Math.min(8, Math.ceil(-Math.log10(priceRange / Math.max(1, Math.abs(top)) * 1000))));
    for (let i = 0; i <= yTickCount; i++) {
      const y = innerTop + (innerH / yTickCount) * i;
      const price = top - (priceRange / yTickCount) * i;
      ctx.fillText(formatPrice(price, dynDecimals), cssW - margin - 6, y);
    }

    // vertical axis separator
    ctx.strokeStyle = "#222629";
    ctx.beginPath();
    ctx.moveTo(innerLeft + innerW + 0.5, innerTop);
    ctx.lineTo(innerLeft + innerW + 0.5, innerTop + innerH);
    ctx.stroke();

    // draw candles (wicks + body)
    data.forEach((c, i) => {
      const x = innerLeft + i * (candleW + spacing) + spacing / 2;
      const priceToY = (p: number) => innerTop + (1 - (p - bottom) / priceRange) * innerH;

      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);
      const yOpen = priceToY(c.open);
      const yClose = priceToY(c.close);

      // wick
      ctx.beginPath();
      ctx.strokeStyle = "#7b8082";
      ctx.lineWidth = 1;
      ctx.moveTo(x + candleW / 2, yHigh);
      ctx.lineTo(x + candleW / 2, yLow);
      ctx.stroke();

      // body
      const up = c.close >= c.open;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyBottom = Math.max(yOpen, yClose);
      const bodyH = Math.max(1, bodyBottom - bodyTop);

      ctx.fillStyle = up ? "#2ecc71" : "#ff6050";
      ctx.fillRect(x, bodyTop, candleW, bodyH);
      // inner stroke for separation
      ctx.strokeStyle = "#0b0b0b";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, bodyTop + 0.5, candleW - 1, bodyH - 1);
    });

    // last price horizontal line and floating tag
    const last = data[data.length - 1];
    const lastY = innerTop + (1 - (last.close - bottom) / priceRange) * innerH;
    ctx.strokeStyle = "#44494a";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(innerLeft, lastY);
    ctx.lineTo(innerLeft + innerW, lastY);
    ctx.stroke();
    ctx.setLineDash([]);

    // last price tag
    const lastLabel = formatPrice(last.close, dynDecimals);
    ctx.font = "12px monospace";
    const textW = ctx.measureText(lastLabel).width + 12;
    const tagX = innerLeft + innerW + (rightAxisWidth - textW) / 2;
    const tagH = 20;
    const tagY = Math.max(innerTop + 4, Math.min(innerTop + innerH - tagH - 4, lastY - tagH / 2));
    ctx.fillStyle = "#2b2f33";
    ctx.fillRect(tagX, tagY, textW, tagH);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lastLabel, tagX + textW / 2, tagY + tagH / 2);

    // X axis time labels
    ctx.fillStyle = "#9aa3a8";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const maxTimeLabels = 6;
    const stepX = Math.max(1, Math.floor(data.length / maxTimeLabels));
    for (let i = 0; i < data.length; i += stepX) {
      const c = data[i];
      const x = innerLeft + i * (candleW + spacing) + candleW / 2;
      const date = new Date(c.time);
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      ctx.fillText(`${hh}:${mm}`, x, innerTop + innerH + 6);
    }

    // tooltip / hover crosshair (if present)
    const hover = hoverRef.current;
    if (hover) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = hover.x - rect.left;
      const mouseY = hover.y - rect.top;

      // compute hovered candle index
      const relX = mouseX - innerLeft;
      const totalStep = candleW + spacing;
      let idx = Math.floor(relX / totalStep);
      idx = Math.max(0, Math.min(data.length - 1, idx));

      const c = data[idx];
      const cx = innerLeft + idx * totalStep + candleW / 2;
      const cy = innerTop + (1 - (c.close - bottom) / priceRange) * innerH;

      // crosshair lines
      ctx.strokeStyle = "rgba(180,180,180,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(innerLeft, mouseY);
      ctx.lineTo(innerLeft + innerW, mouseY);
      ctx.moveTo(cx, innerTop);
      ctx.lineTo(cx, innerTop + innerH);
      ctx.stroke();

      // small highlight on candle
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(cx - candleW / 2 - 2, innerTop, candleW + 4, innerH);

      // info box (top-left of chart)
      const infoLeft = innerLeft + 6;
      const infoTop = innerTop + 6;
      ctx.fillStyle = "rgba(18,20,22,0.9)";
      const infoLines = [
        `${new Date(c.time).toLocaleString()}`,
        `O ${formatPrice(c.open, dynDecimals)}  H ${formatPrice(c.high, dynDecimals)}`,
        `L ${formatPrice(c.low, dynDecimals)}  C ${formatPrice(c.close, dynDecimals)}`,
        `V ${c.volume != null ? c.volume.toFixed(2) : "-"}`,
      ];
      const padding = 8;
      const lineHeight = 16;
      const infoW = Math.max(...infoLines.map((l) => ctx.measureText(l).width)) + padding * 2;
      const infoH = infoLines.length * lineHeight + padding;

      ctx.fillRect(infoLeft, infoTop, infoW, infoH);
      ctx.fillStyle = "#cfd8da";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = "12px monospace";
      for (let i = 0; i < infoLines.length; i++) {
        ctx.fillText(infoLines[i], infoLeft + padding, infoTop + padding / 2 + i * lineHeight);
      }
    }
  };

  // ---------- API calls ----------
  const fetchAssets = async () => {
    if (!token) { setError("No token"); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await axios.get<Asset[]>("http://localhost:3000/balances", { headers: { token } });
      setAssets(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setError("Failed to load balances");
    } finally { setLoading(false); }
  };

  const fetchCandles = async (sym = selectedAsset, interval = selectedInterval, lim = limit) => {
    try {
      const symbolParam = (sym || "").toString().toUpperCase();
      const q = new URLSearchParams({ symbol: symbolParam, interval: String(interval), limit: String(lim) });
      const res = await axios.get(`http://localhost:3000/candles?${q.toString()}`, { headers: token ? { token } : undefined });

      const raw = Array.isArray(res.data) ? res.data : [];
      const normalized: Candle[] = raw.map((r: any) => {
        const t = typeof r.time === "number" ? r.time : Date.parse(String(r.time));
        return {
          time: Number.isNaN(t) ? Date.now() : t,
          open: normalizePrice(r.open),
          high: normalizePrice(r.high),
          low: normalizePrice(r.low),
          close: normalizePrice(r.close),
          volume: r.volume != null ? Number(r.volume) : undefined,
        };
      });

      normalized.sort((a, b) => a.time - b.time);
      setCandles(normalized);
    } catch (err) {
      console.error("fetchCandles error:", err);
      setError("Failed to fetch candles; check backend /candles endpoint.");
    }
  };

  const handleAddAsset = async () => {
    if (!amount || Number(amount) <= 0) return alert("Invalid amount");
    try {
      await axios.post("http://localhost:3000/add", { amount: Number(amount) }, { headers: { token } });
      setAmount("");
      await fetchAssets();
    } catch (err) {
      console.error(err);
      alert("Add failed");
    }
  };

  // ---------- effects ----------
  useEffect(() => { fetchAssets(); /* eslint-disable-next-line */ }, [token]);
  useEffect(() => { fetchCandles(selectedAsset, selectedInterval, limit); /* eslint-disable-next-line */ }, [selectedAsset, selectedInterval, limit]);

  // WebSocket: update last candle in-memory using trade or full-candle messages from backend
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;
    ws.onopen = () => console.log("WS connected");
    ws.onclose = () => console.log("WS closed");
    ws.onerror = (e) => console.error("WS error", e);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const payload = msg.data ?? msg;
        const symbol = (payload.s || payload.symbol || payload.asset || "").toString().toUpperCase();
        if (!symbol || symbol !== selectedAsset.toUpperCase()) return;

        // full candle
        if (payload.open != null && payload.high != null && payload.low != null && payload.close != null && payload.time != null) {
          const t = typeof payload.time === "number" ? payload.time : Date.parse(String(payload.time));
          const cand: Candle = {
            time: getBucketStart(t, selectedInterval),
            open: normalizePrice(payload.open),
            high: normalizePrice(payload.high),
            low: normalizePrice(payload.low),
            close: normalizePrice(payload.close),
            volume: payload.volume != null ? Number(payload.volume) : undefined,
          };
          setCandles((prev) => {
            const last = prev[prev.length - 1];
            if (last && getBucketStart(last.time, selectedInterval) === cand.time) {
              return prev.slice(0, prev.length - 1).concat(cand);
            } else {
              return prev.concat(cand).slice(-limit);
            }
          });
          return;
        }

        // trade message
        const priceRaw = payload.p ?? payload.price ?? payload.price_value ?? null;
        const qtyRaw = payload.q ?? payload.quantity ?? payload.quantity_value ?? 0;
        const tsRaw = payload.T ?? payload.trade_time ?? payload.time ?? Date.now();
        if (priceRaw == null) return;

        const price = normalizePrice(priceRaw);
        const qty = Number(qtyRaw || 0);
        const t = typeof tsRaw === "number" ? tsRaw : Date.parse(String(tsRaw));
        const bucket = getBucketStart(t, selectedInterval);

        setCandles((prev) => {
          if (!prev.length) {
            const c: Candle = { time: bucket, open: price, high: price, low: price, close: price, volume: qty || undefined };
            return [c];
          }
          const last = prev[prev.length - 1];
          const lastBucket = getBucketStart(last.time, selectedInterval);
          if (lastBucket === bucket) {
            const updated: Candle = {
              time: lastBucket,
              open: last.open,
              high: Math.max(last.high, price),
              low: Math.min(last.low, price),
              close: price,
              volume: (last.volume || 0) + (qty || 0),
            };
            return prev.slice(0, prev.length - 1).concat(updated);
          } else if (bucket > lastBucket) {
            const newC: Candle = {
              time: bucket,
              open: last.close,
              high: Math.max(last.close, price),
              low: Math.min(last.close, price),
              close: price,
              volume: qty || undefined,
            };
            return prev.concat(newC).slice(-limit);
          } else {
            return prev;
          }
        });
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };

    return () => {
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
  }, [selectedAsset, selectedInterval, limit]);

  // redraw + mouse handlers + resize
  useEffect(() => {
    drawChart(candles);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (ev: MouseEvent) => {
      hoverRef.current = { x: ev.clientX, y: ev.clientY };
      drawChart(candles);
    };
    const handleLeave = () => {
      hoverRef.current = null;
      drawChart(candles);
    };

    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseleave", handleLeave);

    // Resize observer for responsive redrawing
    const ro = new ResizeObserver(() => drawChart(candles));
    ro.observe(canvas);

    return () => {
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseleave", handleLeave);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles]);

  const usdBal = assets.find((a) => a.asset.toUpperCase() === "USD")?.qty ?? 0;

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: 16, fontFamily: "Inter, Roboto, sans-serif", position: "relative", color: "#e6eef0" }}>
      <div style={{ position: "absolute", right: 16, top: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <input style={{ padding: 6, width: 140 }} type="number" placeholder="Amount USD" value={amount === "" ? "" : String(amount)} onChange={(e) => {
          const v = e.target.value; setAmount(v === "" ? "" : Number(v));
        }} />
        <button onClick={handleAddAsset} style={{ padding: "6px 10px" }}>Add USD</button>
      </div>

      <h2 style={{ textAlign: "left", marginBottom: 6, color: "#e6eef0" }}>Dashboard</h2>

      <div style={{ textAlign: "center", margin: "18px 0" }}>
        <div style={{ fontSize: 12, color: "#9aa3a8" }}>USD Balance</div>
        <div style={{ fontSize: 38, fontWeight: 700 }}>{Number(usdBal).toFixed(2)}</div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label>Asset: <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} style={{ padding: 6 }}>
          {AVAILABLE_ASSETS.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
        </select></label>

        <label>Interval: <select value={selectedInterval} onChange={(e) => setSelectedInterval(e.target.value as IntervalKey)} style={{ padding: 6 }}>
          {INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select></label>

        <label>Limit: <input type="number" value={limit} onChange={(e) => setLimit(Math.max(10, Number(e.target.value) || 10))} style={{ width: 80, padding: 6 }} /></label>

        <button onClick={() => fetchCandles(selectedAsset, selectedInterval, limit)} style={{ marginLeft: "auto", padding: "6px 10px" }}>Refresh candles</button>
      </div>

      <div style={{ border: "1px solid #2a2f33", padding: 12, borderRadius: 8, background: "#081014" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <div><strong style={{ color: "#fff" }}>{selectedAsset.toUpperCase()}</strong> • <span style={{ color: "#9aa3a8" }}>{selectedInterval}</span></div>
          <div style={{ color: "#666", fontSize: 12 }}>{candles.length > 0 ? `Showing ${candles.length} candles` : "No candles"}</div>
        </div>

        <div style={{ width: "100%", height: 360 }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair", borderRadius: 6 }} />
        </div>
      </div>

    </div>
  );
}
