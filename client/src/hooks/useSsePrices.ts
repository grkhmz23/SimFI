import { useState, useEffect, useRef, useCallback } from "react";

interface NativePrices {
  sol: number | null;
  eth: number | null;
  timestamp: number;
}

interface TokenPrice {
  address: string;
  chain: string;
  priceUsd: number;
  priceChange24h: number;
  priceNative: string;
}

interface UseSsePricesReturn {
  nativePrices: NativePrices;
  tokenPrices: Map<string, TokenPrice>;
  subscribe: (tokens: Array<{ address: string; chain: string }>) => void;
  unsubscribe: (tokens: Array<{ address: string; chain: string }>) => void;
  isConnected: boolean;
  useFallback: boolean;
  clientId: string | null;
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 15000];
const FALLBACK_THRESHOLD = 3; // After 3 failed connects, use fallback

export function useSsePrices(): UseSsePricesReturn {
  const [nativePrices, setNativePrices] = useState<NativePrices>({
    sol: null,
    eth: null,
    timestamp: 0,
  });
  const [tokenPrices, setTokenPrices] = useState<Map<string, TokenPrice>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSubsRef = useRef<Array<{ address: string; chain: string }>>([]);
  const clientIdRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) return;
    if (useFallback) return;

    try {
      const es = new EventSource("/api/sse/prices");
      eventSourceRef.current = es;

      es.addEventListener("connected", (e) => {
        const data = JSON.parse(e.data);
        clientIdRef.current = data.clientId;
        setClientId(data.clientId);
        setIsConnected(true);
        reconnectAttemptRef.current = 0;

        // Send any pending subscriptions
        if (pendingSubsRef.current.length > 0) {
          subscribeRemote(data.clientId, pendingSubsRef.current);
          pendingSubsRef.current = [];
        }
      });

      es.addEventListener("nativePrices", (e) => {
        const data = JSON.parse(e.data);
        setNativePrices({
          sol: data.sol ?? null,
          eth: data.eth ?? null,
          timestamp: data.timestamp,
        });
      });

      es.addEventListener("tokenPrices", (e) => {
        const updates: TokenPrice[] = JSON.parse(e.data);
        setTokenPrices((prev) => {
          const next = new Map(prev);
          for (const update of updates) {
            next.set(`${update.chain}:${update.address}`, update);
          }
          return next;
        });
      });

      es.addEventListener("error", () => {
        setIsConnected(false);
        es.close();
        eventSourceRef.current = null;

        reconnectAttemptRef.current++;
        if (reconnectAttemptRef.current >= FALLBACK_THRESHOLD) {
          setUseFallback(true);
          console.warn("[SSE] Falling back to polling after repeated connection failures");
          return;
        }

        const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current - 1, RECONNECT_DELAYS.length - 1)];
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      });
    } catch {
      setUseFallback(true);
    }
  }, [useFallback]);

  const subscribeRemote = async (
    cid: string,
    tokens: Array<{ address: string; chain: string }>
  ) => {
    try {
      await fetch("/api/sse/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: cid, tokens }),
      });
    } catch (err) {
      console.error("[SSE] Subscribe failed:", err);
    }
  };

  const unsubscribeRemote = async (
    cid: string,
    tokens: Array<{ address: string; chain: string }>
  ) => {
    try {
      await fetch("/api/sse/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: cid, tokens }),
      });
    } catch (err) {
      console.error("[SSE] Unsubscribe failed:", err);
    }
  };

  const subscribe = useCallback(
    (tokens: Array<{ address: string; chain: string }>) => {
      const cid = clientIdRef.current;
      if (cid && isConnected) {
        subscribeRemote(cid, tokens);
      } else {
        pendingSubsRef.current.push(...tokens);
      }
    },
    [isConnected]
  );

  const unsubscribe = useCallback(
    (tokens: Array<{ address: string; chain: string }>) => {
      const cid = clientIdRef.current;
      if (cid && isConnected) {
        unsubscribeRemote(cid, tokens);
      }
      // Also remove from pending
      pendingSubsRef.current = pendingSubsRef.current.filter(
        (p) => !tokens.some((t) => t.address === p.address && t.chain === p.chain)
      );
    },
    [isConnected]
  );

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [connect]);

  return {
    nativePrices,
    tokenPrices,
    subscribe,
    unsubscribe,
    isConnected,
    useFallback,
    clientId,
  };
}
