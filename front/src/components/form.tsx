import React, { useMemo, useState } from "react";
import api from "../api";
import type { BalancesMap } from "../hooks/useBalance";

type Side = "buy" | "sell";
type Kind = "market" | "limit";

interface Props {
  assets: string[];
  balances: BalancesMap;
  latestPrices: Record<string, number>;
  onOrderPlaced?: (order: any) => void;
}

export default function OrderForm({ assets, balances, latestPrices, onOrderPlaced }: Props) {
  const [side, setSide] = useState<Side>("buy");
  const [kind, setKind] = useState<Kind>("market");
  const [asset, setAsset] = useState<string>(assets[0] ?? "BTCUSDT");
  const [qty, setQty] = useState<number | "">("");
  const [limitPrice, setLimitPrice] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const latest = latestPrices[asset] ?? NaN;
  const usdBal = balances["USD"] ?? 0;
  const assetBal = balances[asset] ?? 0;

  const cost = useMemo(() => {
    if (!qty || Number(qty) <= 0) return NaN;
    const price = kind === "market" ? latest : Number(limitPrice || 0);
    return Number(qty) * price;
  }, [qty, latest, kind, limitPrice]);

  const validate = () => {
    if (!qty || Number(qty) <= 0) return "Quantity must be > 0";
    if (side === "buy") {
      if (!Number.isFinite(cost) || cost <= 0) return "Unable to compute cost (no price)";
      if (usdBal < cost) return `Insufficient USD balance ($${usdBal.toFixed(2)} < ${cost.toFixed(2)})`;
    } else {
      if ((assetBal ?? 0) < Number(qty)) return `Insufficient ${asset} balance`;
    }
    if (kind === "limit" && (!limitPrice || Number(limitPrice) <= 0)) return "Provide a valid limit price";
    return null;
  };

  const place = async () => {
    const err = validate();
    if (err) return alert(err);
    setBusy(true);
    try {
      if (kind === "market") {
        const res = await api.post("/orders", { type: side, asset, qty: Number(qty) });
        onOrderPlaced?.(res.data.order ?? res.data);
        alert("Market order placed");
      } else {
        const res = await api.post("/limit", { type: side, asset, qty: Number(qty), limitPrice: Number(limitPrice) });
        onOrderPlaced?.(res.data.order ?? res.data);
        alert("Limit order placed");
      }
      setQty("");
      setLimitPrice("");
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.message ?? "Order failed");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: 12, borderRadius: 8, background: "#081014", color: "#dff2f6" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setSide("buy")} style={{ flex: 1, padding: 10, background: side === "buy" ? "#0b8f5d" : "#073322", color: "#fff" }}>Buy</button>
        <button onClick={() => setSide("sell")} style={{ flex: 1, padding: 10, background: side === "sell" ? "#b33b35" : "#3b0b0b", color: "#fff" }}>Sell</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ display: "block", fontSize: 12 }}>Asset</label>
          <select value={asset} onChange={(e) => setAsset(e.target.value)} style={{ width: "100%", padding: 8 }}>
            {assets.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12 }}>Order type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} style={{ width: "100%", padding: 8 }}>
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12 }}>Quantity ({asset})</label>
          <input type="number" value={qty === "" ? "" : String(qty)} onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%", padding: 8 }} />
        </div>

        {kind === "limit" ? (
          <div>
            <label style={{ display: "block", fontSize: 12 }}>Limit price (quote)</label>
            <input type="number" value={limitPrice === "" ? "" : String(limitPrice)} onChange={(e) => setLimitPrice(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%", padding: 8 }} />
          </div>
        ) : (
          <div>
            <label style={{ display: "block", fontSize: 12 }}>Latest price</label>
            <div style={{ padding: 8 }}>{Number.isFinite(latest) ? Number(latest).toFixed(6) : "-"}</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", marginTop: 12 }}>
        <button onClick={place} disabled={busy} style={{ padding: "10px 14px", background: "#2563eb", color: "#fff" }}>{busy ? "Working..." : `Place ${kind.toUpperCase()} ${side.toUpperCase()}`}</button>

        <div style={{ marginLeft: "auto", color: "#9aa3a8", fontSize: 13 }}>
          Cost: <strong style={{ color: "#fff" }}>{Number.isFinite(cost) ? `$ ${cost.toFixed(6)}` : "-"}</strong>
        </div>
      </div>
    </div>
  );
}
