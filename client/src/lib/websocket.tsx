import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Token } from '@shared/schema';

interface TokenData {
  new: Token[];
  graduating: Token[];
  graduated: Token[];
}

interface TokenContextValue extends TokenData {
  getPrice: (tokenAddress: string) => number;
}

const TokenContext = createContext<TokenContextValue>({ 
  new: [], 
  graduating: [], 
  graduated: [],
  getPrice: () => 0,
});

export function TokenProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<TokenData>({ new: [], graduating: [], graduated: [] });
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());

  const getPrice = (tokenAddress: string): number => {
    return priceMap.get(tokenAddress) || 0;
  };

  useEffect(() => {
    let ws: WebSocket;

    // Fetch initial token data from REST API, then establish WebSocket
    const initializeTokens = async () => {
      try {
        const [newRes, graduatingRes, graduatedRes] = await Promise.all([
          fetch('/api/tokens/pairs?category=new'),
          fetch('/api/tokens/pairs?category=graduating'),
          fetch('/api/tokens/pairs?category=graduated'),
        ]);

        if (!newRes.ok || !graduatingRes.ok || !graduatedRes.ok) {
          console.warn('⚠️  Some token API requests failed');
        }

        const [newData, graduatingData, graduatedData] = await Promise.all([
          newRes.json(),
          graduatingRes.json(),
          graduatedRes.json(),
        ]);

        const initialTokens = {
          new: newData.pairs || [],
          graduating: graduatingData.pairs || [],
          graduated: graduatedData.pairs || [],
        };

        setTokens(initialTokens);

        // Initialize price map with all token prices
        const prices = new Map<string, number>();
        [...initialTokens.new, ...initialTokens.graduating, ...initialTokens.graduated].forEach((token: Token) => {
          if (token.price) prices.set(token.tokenAddress, token.price);
        });
        setPriceMap(prices);

        console.log('✅ Initial tokens loaded from API:', {
          new: initialTokens.new.length,
          graduating: initialTokens.graduating.length,
          graduated: initialTokens.graduated.length,
        });
      } catch (error) {
        console.error('❌ Failed to fetch initial tokens:', error);
      }

      // Establish WebSocket connection AFTER REST fetch completes
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => console.log('WebSocket connected');

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'init') {
            // Handle initial token state from server
            const { new: newTokens, graduating, graduated } = data.payload;
            setTokens({ new: newTokens, graduating, graduated });
            
            // Initialize price map with all token prices
            const prices = new Map<string, number>();
            [...newTokens, ...graduating, ...graduated].forEach((token: Token) => {
              if (token.price) prices.set(token.tokenAddress, token.price);
            });
            setPriceMap(prices);
          } else if (data.type === 'new') {
            setTokens(prev => ({
              ...prev,
              new: [data.payload, ...prev.new].slice(0, 100)
            }));
            if (data.payload.price) {
              setPriceMap(prev => new Map(prev).set(data.payload.tokenAddress, data.payload.price));
            }
          } else if (data.type === 'graduating') {
            setTokens(prev => ({
              ...prev,
              new: prev.new.filter(t => t.tokenAddress !== data.payload.tokenAddress),
              graduating: [data.payload, ...prev.graduating].slice(0, 100)
            }));
            if (data.payload.price) {
              setPriceMap(prev => new Map(prev).set(data.payload.tokenAddress, data.payload.price));
            }
          } else if (data.type === 'graduated') {
            setTokens(prev => ({
              ...prev,
              graduating: prev.graduating.filter(t => t.tokenAddress !== data.payload.tokenAddress),
              graduated: [data.payload, ...prev.graduated].slice(0, 100)
            }));
            if (data.payload.price) {
              setPriceMap(prev => new Map(prev).set(data.payload.tokenAddress, data.payload.price));
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onerror = (error) => console.error('WebSocket error:', error);
      ws.onclose = () => console.log('WebSocket disconnected');
    };

    initializeTokens();

    return () => {
      if (ws) ws.close();
    };
  }, []);

  return <TokenContext.Provider value={{ ...tokens, getPrice }}>{children}</TokenContext.Provider>;
}

export function useTokens() {
  return useContext(TokenContext);
}
