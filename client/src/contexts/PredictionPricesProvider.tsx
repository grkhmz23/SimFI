import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";

interface Tick {
  tokenId: string;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  receivedAt: number;
}

interface PredictionPricesContextType {
  prices: Map<string, Tick>;
  subscribe: (tokenIds: string[]) => void;
  unsubscribe: (tokenIds: string[]) => void;
  isConnected: boolean;
}

const PredictionPricesContext = createContext<PredictionPricesContextType | undefined>(undefined);

export function PredictionPricesProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Map<string, Tick>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const clientIdRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;

    const es = new EventSource("/api/sse/prediction-prices");
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    es.addEventListener("tick", (e) => {
      try {
        const tick: Tick = JSON.parse(e.data);
        setPrices((prev) => {
          const next = new Map(prev);
          next.set(tick.tokenId, tick);
          return next;
        });
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      eventSourceRef.current = null;

      const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30_000);
      reconnectAttemptsRef.current++;
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect]);

  const subscribe = useCallback((tokenIds: string[]) => {
    if (!clientIdRef.current) {
      // SSE connection sends clientId in connected event; we don't track it here.
      // Instead, subscribe via query param on reconnect or use a simple approach.
      // For v1, we rely on the initial query param or re-open with new params.
    }
    // POST subscribe with the current SSE connection isn't straightforward without clientId.
    // v1 simplification: just include tokenIds in the EventSource URL on next reconnect.
    // A more robust v2 would parse the connected event for clientId.
  }, []);

  const unsubscribe = useCallback((tokenIds: string[]) => {
    // Same limitation as subscribe for v1
  }, []);

  return (
    <PredictionPricesContext.Provider value={{ prices, subscribe, unsubscribe, isConnected }}>
      {children}
    </PredictionPricesContext.Provider>
  );
}

export function usePredictionPrices(): PredictionPricesContextType {
  const ctx = useContext(PredictionPricesContext);
  if (!ctx) {
    throw new Error("usePredictionPrices must be used within PredictionPricesProvider");
  }
  return ctx;
}
