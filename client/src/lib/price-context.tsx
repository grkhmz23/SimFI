import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useChain } from './chain-context';
import { useSsePrices } from '@/hooks/useSsePrices';
import type { Chain } from '@shared/schema';

interface NativePricesResponse {
  eth: { usd: number | null; source: string | null; timestamp: number | null };
  sol: { usd: number | null; source: string | null; timestamp: number | null };
}

interface PriceContextType {
  solPriceUSD: number | null;
  ethPriceUSD: number | null;
  activePriceUSD: number | null;
  getPrice: (chain: Chain) => number | null;
  isLoading: boolean;
  isError: boolean;
}

const PriceContext = createContext<PriceContextType | undefined>(undefined);

function useNativePricesFallback(): NativePricesResponse | null {
  const { data } = useQuery<NativePricesResponse>({
    queryKey: ['/api/market/native-prices'],
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('503') || error?.message?.includes('Native prices temporarily unavailable')) return false;
      return failureCount < 2;
    },
  });
  return data ?? null;
}

export function PriceProvider({ children }: { children: ReactNode }) {
  const { activeChain } = useChain();
  const sse = useSsePrices();
  const fallbackPrices = useNativePricesFallback();

  // Use SSE prices when connected, otherwise fall back to polling
  const solPriceUSD = sse.useFallback
    ? (fallbackPrices?.sol?.usd ?? null)
    : (sse.nativePrices.sol ?? fallbackPrices?.sol?.usd ?? null);

  const ethPriceUSD = sse.useFallback
    ? (fallbackPrices?.eth?.usd ?? null)
    : (sse.nativePrices.eth ?? fallbackPrices?.eth?.usd ?? null);

  const getPrice = (chain: Chain): number | null => {
    return chain === 'solana' ? solPriceUSD : ethPriceUSD;
  };

  const activePriceUSD = activeChain === 'solana' ? solPriceUSD : ethPriceUSD;
  const isLoading = sse.useFallback && fallbackPrices === null;
  const isError = solPriceUSD === null && ethPriceUSD === null;

  const value = useMemo(
    () => ({
      solPriceUSD,
      ethPriceUSD,
      activePriceUSD,
      getPrice,
      isLoading,
      isError,
    }),
    [solPriceUSD, ethPriceUSD, activePriceUSD, isLoading, isError]
  );

  return (
    <PriceContext.Provider value={value}>
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
export function useActivePrice(): number | null {
  const context = useContext(PriceContext);
  if (!context) {
    return null;
  }
  return context.activePriceUSD;
}

// Hook to get price for a specific chain
export function useChainPrice(chain: Chain): number | null {
  const context = useContext(PriceContext);
  if (!context) {
    return null;
  }
  return context.getPrice(chain);
}

// Backward compatibility - old hook name
export function useSolPrice(): number | null {
  return useChainPrice('solana');
}
