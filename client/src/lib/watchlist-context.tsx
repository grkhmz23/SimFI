import { createContext, useContext, useCallback, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WatchlistItem, Chain } from '@shared/schema';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/queryClient';

interface WatchlistContextType {
  items: WatchlistItem[];
  isLoading: boolean;
  isError: boolean;
  addToWatchlist: (data: {
    chain: Chain;
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    decimals: number;
  }) => Promise<void>;
  removeFromWatchlist: (id: string) => Promise<void>;
  isInWatchlist: (tokenAddress: string, chain: Chain) => boolean;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const {
    data,
    isLoading,
    isError,
  } = useQuery<{ items: WatchlistItem[] }>({
    queryKey: ['/api/watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        return { items: [] };
      }
      if (!res.ok) throw new Error('Failed to fetch watchlist');
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: isAuthenticated ? 60_000 : false,
  });

  const items = data?.items || [];

  const addMutation = useMutation({
    mutationFn: async (payload: {
      chain: Chain;
      tokenAddress: string;
      tokenName: string;
      tokenSymbol: string;
      decimals: number;
    }) => {
      return apiRequest('POST', '/api/watchlist', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
  });

  const addToWatchlist = useCallback(
    async (data: {
      chain: Chain;
      tokenAddress: string;
      tokenName: string;
      tokenSymbol: string;
      decimals: number;
    }) => {
      await addMutation.mutateAsync(data);
    },
    [addMutation]
  );

  const removeFromWatchlist = useCallback(
    async (id: string) => {
      await removeMutation.mutateAsync(id);
    },
    [removeMutation]
  );

  const isInWatchlist = useCallback(
    (tokenAddress: string, chain: Chain) => {
      return items.some(
        (item) => item.tokenAddress === tokenAddress && item.chain === chain
      );
    },
    [items]
  );

  return (
    <WatchlistContext.Provider
      value={{
        items,
        isLoading,
        isError,
        addToWatchlist,
        removeFromWatchlist,
        isInWatchlist,
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextType {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
}
