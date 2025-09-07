import { useEffect, useRef } from "react";

export type WSMessageHandler = (msg: any) => void;

export function useWebSocket(onMessage: WSMessageHandler, url = "ws://localhost:8080") {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let mounted = true;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => console.log("WS connected to", url);
      ws.onclose = () => console.log("WS closed");
      ws.onerror = (e) => console.error("WS error", e);
      ws.onmessage = (ev) => {
        if (!mounted) return;
        try {
          const parsed = JSON.parse(ev.data);
          onMessage(parsed);
        } catch (err) {
          // If message is plain string, pass raw
          onMessage(ev.data);
        }
      };
    } catch (err) {
      console.error("Failed opening WS", err);
    }

    return () => {
      mounted = false;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [onMessage, url]);

  return wsRef;
}
