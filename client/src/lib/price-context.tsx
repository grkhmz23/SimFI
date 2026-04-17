import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useChain } from './chain-context';
import type { Chain } from '@shared/schema';

interface PriceContextType {
  solPriceUSD: number;
  ethPriceUSD: number;
  activePriceUSD: number; // Price of currently active chain's native token
  getPrice: (chain: Chain) => number;
}

const PriceContext = createContext<PriceContextType | undefined>(undefined);

export function PriceProvider({ children }: { children: ReactNode }) {
  const { activeChain } = useChain();
  const [solPriceUSD, setSolPriceUSD] = useState(140); // Default fallback
  const [ethPriceUSD, setEthPriceUSD] = useState(3500); // Default fallback

  // Fetch both prices on mount
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Fetch SOL price
        const solResponse = await fetch('/api/solana/price');
        if (solResponse.ok) {
          const data = await solResponse.json();
          setSolPriceUSD(data.price || 140);
        }
      } catch (error) {
        console.warn('Failed to fetch SOL price, using fallback');
      }

      try {
        // Fetch ETH price
        const ethResponse = await fetch('/api/base/price');
        if (ethResponse.ok) {
          const data = await ethResponse.json();
          setEthPriceUSD(data.price || 3500);
        }
      } catch (error) {
        console.warn('Failed to fetch ETH price, using fallback');
      }
    };

    fetchPrices();

    // Refresh every 30 seconds
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  // Get price for specific chain
  const getPrice = (chain: Chain): number => {
    return chain === 'solana' ? solPriceUSD : ethPriceUSD;
  };

  // Active price based on current chain
  const activePriceUSD = activeChain === 'solana' ? solPriceUSD : ethPriceUSD;

  return (
    <PriceContext.Provider value={{ solPriceUSD, ethPriceUSD, activePriceUSD, getPrice }}>
      {children}
    </PriceContext.Provider>
  );
}

export function usePrice(): PriceContextType {
  const context = useContext(PriceContext);
  if (!context) {
    throw new Error('usePrice must be used within a PriceProvider');
  }
  return context;
}

// Hook to get just the active chain's price
export function useActivePrice(): number {
  const context = useContext(PriceContext);
  if (!context) {
    return 140; // Fallback
  }
  return context.activePriceUSD;
}

// Hook to get price for a specific chain
export function useChainPrice(chain: Chain): number {
  const context = useContext(PriceContext);
  if (!context) {
    return chain === 'solana' ? 140 : 3500;
  }
  return context.getPrice(chain);
}

// Backward compatibility - old hook name
export function useSolPrice(): number {
  return useChainPrice('solana');
}
