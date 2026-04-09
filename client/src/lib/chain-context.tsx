import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Chain } from '@shared/schema';

interface ChainContextType {
  activeChain: Chain;
  setActiveChain: (chain: Chain) => void;
  toggleChain: () => void;
  nativeSymbol: string;
  nativeDecimals: number;
  isBase: boolean;
  isSolana: boolean;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

const CHAIN_STORAGE_KEY = 'simfi-preferred-chain';

export function ChainProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage or default to 'base'
  const [activeChain, setActiveChainState] = useState<Chain>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(CHAIN_STORAGE_KEY);
      if (stored === 'solana' || stored === 'base') {
        return stored;
      }
    }
    return 'base';
  });

  // Persist chain preference to localStorage
  const setActiveChain = (chain: Chain) => {
    setActiveChainState(chain);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CHAIN_STORAGE_KEY, chain);
    }
  };

  // Toggle between chains
  const toggleChain = () => {
    const newChain = activeChain === 'base' ? 'solana' : 'base';
    setActiveChain(newChain);
  };

  // Derived values based on active chain
  const nativeSymbol = activeChain === 'base' ? 'ETH' : 'SOL';
  const nativeDecimals = activeChain === 'base' ? 18 : 9;
  const isBase = activeChain === 'base';
  const isSolana = activeChain === 'solana';

  // Sync with user's preferred chain from profile (if logged in)
  useEffect(() => {
    const syncWithUserPreference = async () => {
      try {
        const response = await fetch('/api/auth/profile', {
          credentials: 'include',
        });
        if (response.ok) {
          const user = await response.json();
          if (user.preferredChain && (user.preferredChain === 'base' || user.preferredChain === 'solana')) {
            // Only update if different from current
            if (user.preferredChain !== activeChain) {
              setActiveChainState(user.preferredChain);
            }
          }
        }
      } catch (error) {
        // Silent fail - localStorage value will be used
        console.warn('Could not sync chain preference with user profile');
      }
    };

    syncWithUserPreference();
  }, []);

  return (
    <ChainContext.Provider
      value={{
        activeChain,
        setActiveChain,
        toggleChain,
        nativeSymbol,
        nativeDecimals,
        isBase,
        isSolana,
      }}
    >
      {children}
    </ChainContext.Provider>
  );
}

export function useChain(): ChainContextType {
  const context = useContext(ChainContext);
  if (context === undefined) {
    throw new Error('useChain must be used within a ChainProvider');
  }
  return context;
}

// Hook to get just the active chain value
export function useActiveChain(): Chain {
  return useChain().activeChain;
}
