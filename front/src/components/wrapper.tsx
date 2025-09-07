import React, { useCallback, useEffect, useState } from "react";
import OrderForm from "./form";
import BalancesPanel from "./balance";
import ActiveOrders from "./active";
import TradeNotifications from "./notif";
import { useBalances } from "../hooks/useBalance";
import { useWebSocket } from "../hooks/useWebSocket";
import api from "../api";
import Dash from "./dash";

export default function DashboardWrapper() {
  const assetsList = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT"];
  const { balances, loading, refresh } = useBalances();

  const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});
  const [incomingOrder, setIncomingOrder] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);

  // WebSocket message handler
  const handleWS = useCallback(
    (msg: any) => {
      if (!msg) return;
      if (typeof msg === "string") {
        try {
          msg = JSON.parse(msg);
        } catch (e) {
          return;
        }
      }

      if (msg.type === "price" && msg.data) {
        setLatestPrices((p) => ({ ...p, [msg.data.symbol]: Number(msg.data.price) }));
        return;
      }

      if (msg.type === "trade" && msg.data) {
        if (msg.data.userId) refresh();
        setNotifications((s) => [
          {
            title: "Trade executed",
            message: `${msg.data.type} ${msg.data.qty} ${msg.data.asset} @ ${msg.data.price}`,
          },
          ...s,
        ].slice(0, 6));
        return;
      }

      if (msg.type === "order" && msg.data) {
        setIncomingOrder(msg.data);
        if (msg.data.status === "closed") refresh();
        setNotifications((s) => [
          {
            title: "Order update",
            message: `${msg.data.type} ${msg.data.qty} ${msg.data.asset} - ${msg.data.status}`,
          },
          ...s,
        ].slice(0, 6));
        return;
      }

      // Fallback
      if (msg.symbol && (msg.price || msg.last)) {
        setLatestPrices((p) => ({ ...p, [msg.symbol]: Number(msg.price ?? msg.last) }));
      }
      if (msg.asset && msg.qty && (msg.status || msg.price)) {
        setIncomingOrder(msg);
        if (msg.status === "closed") refresh();
      }
    },
    [refresh]
  );

  useWebSocket(handleWS, "ws://localhost:8080");

  // Poll latest prices
  useEffect(() => {
    let mounted = true;
    const fetchPrices = async () => {
      try {
        const res = await api.get("/latest_prices");
        if (!mounted) return;
        if (res.data && typeof res.data === "object") setLatestPrices(res.data);
      } catch (e) {}
    };
    fetchPrices();
    const t = setInterval(fetchPrices, 5000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const handleOrderPlaced = (o: any) => {
    setIncomingOrder(o);
    setTimeout(() => refresh(), 1000);
  };

  return (
    <div style={{ padding: 16, fontFamily: "Inter, Roboto, sans-serif", color: "#dff2f6" }}>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 360px", gap: 12 }}>
        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BalancesPanel balances={balances} />
          <ActiveOrders incomingOrder={incomingOrder ?? undefined} />
        </div>

        {/* Center Column */}
        <div>
          <div style={{ marginTop: 12 }}>
            <OrderForm
              assets={assetsList}
              balances={balances}
              latestPrices={latestPrices}
              onOrderPlaced={handleOrderPlaced}
            />
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 8, background: "#071014" }}>
            <div style={{ fontSize: 12, color: "#9aa3a8", marginBottom: 8 }}>Market</div>
            {Object.keys(latestPrices).length === 0 ? (
              <div style={{ color: "#88a" }}>No price data</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(latestPrices).map(([sym, p]) => (
                  <div key={sym} style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>{sym}</div>
                    <div>{Number(p).toFixed(6)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <TradeNotifications notifications={notifications} />
        </div>
      </div>
    </div>
  );
}
