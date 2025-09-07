import React from "react";

export default function TradeNotifications({ notifications }: { notifications: any[] }) {
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 50, display: "flex", flexDirection: "column", gap: 8 }}>
      {notifications.map((n, i) => (
        <div key={i} style={{ background: "#0b2a2b", color: "#dff2f6", padding: 10, borderRadius: 6, minWidth: 240 }}>
          <div style={{ fontWeight: 700 }}>{n.title}</div>
          <div style={{ fontSize: 13 }}>{n.message}</div>
        </div>
      ))}
    </div>
  );
}

