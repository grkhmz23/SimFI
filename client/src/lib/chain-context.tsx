// client/src/lib/chain-context.tsx
// Chain selection context for multi-chain support

import React, { createContext, useContext, useState, useCallback } from 'react';

export type Chain = 'solana' | 'base';

export interface ChainConfig {
  id: Chain;
  name: string;
  nativeSymbol: string;
  nativeName: string;
  decimals: number;
  blockExplorerUrl: string;
}

export const CHAIN_CONFIG: Record<Chain, ChainConfig> = {
  solana: {
    id: 'solana',
    name: 'Solana',
    nativeSymbol: 'SOL',
    nativeName: 'Solana',
    decimals: 9,
    blockExplorerUrl: 'https://solscan.io',
  },
  base: {
    id: 'base',
    name: 'Base',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    decimals: 18,
    blockExplorerUrl: 'https://base.blockscout.com',
  },
};

export const CHAINS: Chain[] = ['solana', 'base'];

interface ChainContextType {
  chain: Chain;
  setChain: (chain: Chain) => void;
  toggleChain: () => void;
  config: ChainConfig;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

export function ChainProvider({ children }: { children: React.ReactNode }) {
  const [chain, setChainState] = useState<Chain>('solana');

  const setChain = useCallback((newChain: Chain) => {
    setChainState(newChain);
    // Store preference in localStorage
    localStorage.setItem('preferred_chain', newChain);
  }, []);

  const toggleChain = useCallback(() => {
    const newChain: Chain = chain === 'solana' ? 'base' : 'solana';
    setChain(newChain);
  }, [chain, setChain]);

  // Load saved preference on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('preferred_chain') as Chain | null;
    if (saved && CHAINS.includes(saved)) {
      setChainState(saved);
    }
  }, []);

  const value: ChainContextType = {
    chain,
    setChain,
    toggleChain,
    config: CHAIN_CONFIG[chain],
  };

  return (
    <ChainContext.Provider value={value}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChain() {
  const context = useContext(ChainContext);
  if (context === undefined) {
    throw new Error('useChain must be used within a ChainProvider');
  }
  return context;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function isValidChain(chain: string): chain is Chain {
  return CHAINS.includes(chain as Chain);
}

/**
 * Validate Solana address (Base58, 32-44 chars)
 */
export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/**
 * Validate EVM address (0x + 40 hex chars)
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate address for a specific chain
 */
export function isValidChainAddress(chain: Chain, address: string): boolean {
  switch (chain) {
    case 'solana':
      return isValidSolanaAddress(address);
    case 'base':
      return isValidEvmAddress(address);
    default:
      return false;
  }
}

/**
 * Format native amount for display
 * Example: 1500000000 lamports -> "1.5 SOL"
 */
export function formatNativeAmount(chain: Chain, baseUnits: bigint | string): string {
  const config = CHAIN_CONFIG[chain];
  const units = typeof baseUnits === 'string' ? BigInt(baseUnits) : baseUnits;
  
  const divisor = BigInt(10 ** config.decimals);
  const whole = units / divisor;
  const frac = units % divisor;
  
  if (frac === 0n) {
    return `${whole.toString()} ${config.nativeSymbol}`;
  }
  
  // Format fractional part
  let fracStr = frac.toString().padStart(config.decimals, '0');
  fracStr = fracStr.replace(/0+$/, ''); // Trim trailing zeros
  
  // Limit to 6 decimal places for display
  if (fracStr.length > 6) {
    fracStr = fracStr.slice(0, 6);
  }
  
  return `${whole.toString()}.${fracStr} ${config.nativeSymbol}`;
}

/**
 * Parse display amount to base units
 * Example: "1.5" SOL -> 1500000000 lamports
 */
export function parseNativeAmount(chain: Chain, amount: string): bigint {
  const config = CHAIN_CONFIG[chain];
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  let frac = parts[1] || '';
  
  // Pad or truncate to chain's decimals
  if (frac.length > config.decimals) {
    frac = frac.slice(0, config.decimals);
  } else {
    frac = frac.padEnd(config.decimals, '0');
  }
  
  return BigInt(whole + frac);
}

/**
 * Get block explorer URL for an address
 */
export function getExplorerUrl(chain: Chain, type: 'address' | 'token' | 'tx', value: string): string {
  const config = CHAIN_CONFIG[chain];
  switch (type) {
    case 'address':
      return chain === 'solana' 
        ? `${config.blockExplorerUrl}/account/${value}`
        : `${config.blockExplorerUrl}/address/${value}`;
    case 'token':
      return `${config.blockExplorerUrl}/token/${value}`;
    case 'tx':
      return `${config.blockExplorerUrl}/tx/${value}`;
    default:
      return config.blockExplorerUrl;
  }
}
