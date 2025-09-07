import React from "react";
import type { BalancesMap } from "../hooks/useBalance";

export default function BalancesPanel({ balances }: { balances: BalancesMap }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, background: "#071014", color: "#dff2f6" }}>
      <div style={{ fontSize: 12, color: "#9aa3a8", marginBottom: 6 }}>Your Balances</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.keys(balances).length === 0 ? (
          <div style={{ color: "#88a" }}>No balances</div>
        ) : (
          Object.entries(balances).map(([asset, qty]) => (
            <div key={asset} style={{ minWidth: 120, padding: 8, background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: "#9aa3a8" }}>{asset}</div>
              <div style={{ fontWeight: 700 }}>{Number(qty).toLocaleString(undefined, { maximumFractionDigits: 8 })}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}