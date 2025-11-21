import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PriceContextType {
  solPriceUSD: number;
}

const PriceContext = createContext<PriceContextType | undefined>(undefined);

export function PriceProvider({ children }: { children: ReactNode }) {
  const [solPriceUSD, setSolPriceUSD] = useState(175); // Default fallback

  useEffect(() => {
    // Fetch SOL price on mount
    const fetchPrice = async () => {
      try {
        const response = await fetch('/api/solana/price');
        if (response.ok) {
          const data = await response.json();
          setSolPriceUSD(data.price || 175);
        }
      } catch (error) {
        console.warn('Failed to fetch SOL price, using fallback');
      }
    };

    fetchPrice();

    // Refresh every 30 seconds
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <PriceContext.Provider value={{ solPriceUSD }}>
      {children}
    </PriceContext.Provider>
  );
}

export function useSolPrice(): number {
  const context = useContext(PriceContext);
  if (!context) {
    return 175; // Fallback if context not available
  }
  return context.solPriceUSD;
}
