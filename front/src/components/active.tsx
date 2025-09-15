import  { useEffect, useState } from "react";
import api from "../api";

export default function ActiveOrders({ incomingOrder }: { incomingOrder?: any }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);


  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get("/orders");
      if (Array.isArray(res.data)) setOrders(res.data);
    } catch (err) {
    
      console.debug("GET /orders failed (server may not implement)", err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  useEffect(() => {
    if (!incomingOrder) return;
    setOrders((s) => [incomingOrder, ...s].slice(0, 50));
  }, [incomingOrder]);

  return (
    <div style={{ padding: 12, borderRadius: 8, background: "#071014", color: "#dff2f6" }}>
      <div style={{ fontSize: 12, color: "#9aa3a8", marginBottom: 8 }}>Recent Orders / Executions</div>
      {loading ? <div>Loading...</div> : (
        <div style={{ display: "grid", gap: 8 }}>
          {orders.length === 0 ? <div style={{ color: "#88a" }}>No orders</div> : orders.map((o: any) => (
            <div key={o.id ?? (o._tmpId ?? Math.random())} style={{ padding: 8, background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div><strong>{o.type?.toUpperCase()}</strong> {o.asset}</div>
                <div style={{ color: "#9aa3a8" }}>{o.status ?? "-"}</div>
              </div>
              <div style={{ marginTop: 6, color: "#cfe" }}>Qty: {Number(o.qty ?? 0)} @ {Number(o.price ?? o.limitPrice ?? 0)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

