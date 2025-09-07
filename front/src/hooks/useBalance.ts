import { useEffect, useState, useCallback } from "react";
import api from "../api";

export type BalancesMap = Record<string, number>;

export function useBalances(refreshInterval = 5000) { // default refresh every 5s
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState<BalancesMap>({});
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/balances");
      // API returns array of {asset, qty, type}
      const map: BalancesMap = {};
      if (Array.isArray(res.data)) {
        for (const row of res.data) map[row.asset] = Number(row.qty ?? 0);
      }
      setBalances(map);
    } catch (err: any) {
      console.error("fetch balances", err);
      setError(err?.response?.data?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // fetch immediately and then at regular intervals
  useEffect(() => {
    fetch(); // initial fetch
    const intervalId = setInterval(fetch, refreshInterval);
    return () => clearInterval(intervalId); // cleanup on unmount
  }, [fetch, refreshInterval]);

  return { balances, loading, error, refresh: fetch, setBalances } as const;
}
