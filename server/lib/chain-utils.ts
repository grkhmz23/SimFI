// server/lib/chain-utils.ts
// Chain abstraction utilities for multi-chain support

/**
 * Supported chains
 */
export type Chain = 'solana' | 'base';

export const CHAINS: Chain[] = ['solana', 'base'];

/**
 * Chain configuration
 */
export interface ChainConfig {
  id: Chain;
  name: string;
  nativeSymbol: string;
  nativeName: string;
  decimals: number;
  dexScreenerChainId: string;
  blockExplorerUrl: string;
  rpcUrl: string;
}

export const CHAIN_CONFIG: Record<Chain, ChainConfig> = {
  solana: {
    id: 'solana',
    name: 'Solana',
    nativeSymbol: 'SOL',
    nativeName: 'Solana',
    decimals: 9,
    dexScreenerChainId: 'solana',
    blockExplorerUrl: 'https://solscan.io',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  },
  base: {
    id: 'base',
    name: 'Base',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    decimals: 18,
    dexScreenerChainId: 'base',
    blockExplorerUrl: 'https://base.blockscout.com',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  },
};

/**
 * Decimal constants
 */
export const CHAIN_DECIMALS: Record<Chain, number> = {
  solana: 9,   // lamports
  base: 18,    // wei
};

/**
 * Multiplier to convert from base units to whole units
 */
export function getChainMultiplier(chain: Chain): bigint {
  return BigInt(10) ** BigInt(CHAIN_DECIMALS[chain]);
}

/**
 * Validate if a string is a valid chain identifier
 */
export function isValidChain(chain: string): chain is Chain {
  return CHAINS.includes(chain as Chain);
}

/**
 * Assert that a string is a valid chain
 */
export function assertValidChain(chain: string): asserts chain is Chain {
  if (!isValidChain(chain)) {
    throw new Error(`Invalid chain: ${chain}. Must be one of: ${CHAINS.join(', ')}`);
  }
}

// ============================================================================
// ADDRESS VALIDATION
// ============================================================================

/**
 * Solana address: Base58 encoded, 32-44 characters
 * Examples: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (USDC)
 */
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * EVM address (Base/Ethereum): 0x prefix + 40 hex characters
 * Examples: 0x4200000000000000000000000000000000000006 (WETH on Base)
 */
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validate Solana address format
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return SOLANA_ADDRESS_REGEX.test(address);
}

/**
 * Validate EVM address format (Base, Ethereum, etc.)
 */
export function isValidEvmAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return EVM_ADDRESS_REGEX.test(address);
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
 * Get validation error message for an address
 */
export function getAddressValidationError(chain: Chain, address: string): string | null {
  if (!address) return 'Address is required';
  
  switch (chain) {
    case 'solana':
      return isValidSolanaAddress(address) 
        ? null 
        : 'Invalid Solana address. Expected 32-44 Base58 characters.';
    case 'base':
      return isValidEvmAddress(address) 
        ? null 
        : 'Invalid EVM address. Expected 0x followed by 40 hex characters.';
    default:
      return 'Invalid chain';
  }
}

// ============================================================================
// AMOUNT CONVERSION
// ============================================================================

/**
 * Convert a decimal amount string to base units (lamports/wei) for a specific chain
 * 
 * Examples:
 * - parseToBaseUnits('solana', '1.5') => 1500000000n (1.5 SOL in lamports)
 * - parseToBaseUnits('base', '0.5') => 500000000000000000n (0.5 ETH in wei)
 */
export function parseToBaseUnits(chain: Chain, amount: string | number): bigint {
  const amountStr = String(amount).trim();
  const decimals = CHAIN_DECIMALS[chain];
  
  // Validate format: optional digits, optional decimal, required digits
  if (!/^-?\d*\.?\d+$/.test(amountStr)) {
    throw new Error(`Invalid ${chain} amount format: ${amountStr}`);
  }
  
  // Split on decimal point
  const parts = amountStr.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';
  
  // Pad or truncate fractional part to exactly N digits
  if (fracPart.length > decimals) {
    fracPart = fracPart.slice(0, decimals);
  } else {
    fracPart = fracPart.padEnd(decimals, '0');
  }
  
  // Combine and parse as BigInt
  const baseUnitsStr = wholePart + fracPart;
  
  // Bounds check
  if (baseUnitsStr.length > 30) {
    throw new Error('Amount exceeds maximum precision');
  }
  
  return BigInt(baseUnitsStr);
}

/**
 * Convert base units (lamports/wei) to a decimal string for display
 * 
 * Examples:
 * - formatFromBaseUnits('solana', 1500000000n) => '1.5'
 * - formatFromBaseUnits('base', 500000000000000000n) => '0.5'
 */
export function formatFromBaseUnits(chain: Chain, baseUnits: bigint): string {
  const decimals = CHAIN_DECIMALS[chain];
  const multiplier = BigInt(10) ** BigInt(decimals);
  
  const wholePart = baseUnits / multiplier;
  const fracPart = baseUnits % multiplier;
  
  if (fracPart === 0n) {
    return wholePart.toString();
  }
  
  // Format fractional part with leading zeros
  let fracStr = fracPart.toString().padStart(decimals, '0');
  
  // Trim trailing zeros
  fracStr = fracStr.replace(/0+$/, '');
  
  return `${wholePart}.${fracStr}`;
}

/**
 * Convert base units to a number (use with caution - may lose precision for large values)
 * Only use for display calculations, not for precise math
 */
export function baseUnitsToNumber(chain: Chain, baseUnits: bigint): number {
  return Number(formatFromBaseUnits(chain, baseUnits));
}

// ============================================================================
// PRICE CONVERSION
// ============================================================================

/**
 * Parse a price string (in native token units) to base units for storage
 * Used when converting API prices (e.g., DexScreener) to our internal format
 * 
 * Example: DexScreener returns "0.000123" SOL per token
 * - For Solana: parsePriceToBaseUnits('solana', '0.000123') => 123000 (lamports)
 * - For Base: parsePriceToBaseUnits('base', '0.000123') => 123000000000000 (wei)
 */
export function parsePriceToBaseUnits(chain: Chain, priceStr: string): number {
  if (!priceStr || priceStr === '0') return 0;
  
  const str = priceStr.trim();
  const decimals = CHAIN_DECIMALS[chain];
  
  // Validate format
  if (!/^\d*\.?\d+$/.test(str)) {
    console.warn(`Invalid price format for ${chain}: ${str}`);
    return 0;
  }
  
  // Split on decimal point
  const parts = str.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';
  
  // Pad or truncate fractional part to exactly N digits
  if (fracPart.length > decimals) {
    fracPart = fracPart.slice(0, decimals);
  } else {
    fracPart = fracPart.padEnd(decimals, '0');
  }
  
  // Remove leading zeros from whole part
  const cleanWhole = wholePart.replace(/^0+/, '') || '0';
  
  // Combine and parse
  const baseUnitsStr = cleanWhole + fracPart;
  const baseUnits = parseInt(baseUnitsStr, 10);
  
  if (isNaN(baseUnits)) return 0;
  if (baseUnits > 0) return baseUnits;
  
  // If we parsed 0 but input wasn't "0", return 1 (sub-base-unit price)
  return str !== '0' && parseFloat(str) > 0 ? 1 : 0;
}

// ============================================================================
// TRADE AMOUNT VALIDATION
// ============================================================================

/**
 * Minimum trade amounts per chain (in base units)
 */
export const MIN_TRADE_AMOUNTS: Record<Chain, bigint> = {
  solana: 1_000_000n,           // 0.001 SOL
  base: 1_000_000_000_000_000n, // 0.001 ETH
};

/**
 * Maximum trade amounts per chain (in base units)
 */
export const MAX_TRADE_AMOUNTS: Record<Chain, bigint> = {
  solana: 100_000_000_000n,           // 100 SOL
  base: 100_000_000_000_000_000_000n, // 100 ETH
};

/**
 * Validate trade amount for a specific chain
 */
export function validateTradeAmount(chain: Chain, baseUnits: bigint): void {
  const minAmount = MIN_TRADE_AMOUNTS[chain];
  const maxAmount = MAX_TRADE_AMOUNTS[chain];
  const symbol = CHAIN_CONFIG[chain].nativeSymbol;
  
  if (baseUnits <= 0n) {
    throw new Error('Trade amount must be positive');
  }
  if (baseUnits < minAmount) {
    const minDisplay = formatFromBaseUnits(chain, minAmount);
    throw new Error(`Trade amount too small (minimum ${minDisplay} ${symbol})`);
  }
  if (baseUnits > maxAmount) {
    const maxDisplay = formatFromBaseUnits(chain, maxAmount);
    throw new Error(`Trade amount too large (maximum ${maxDisplay} ${symbol})`);
  }
}

// ============================================================================
// DEFAULT BALANCES
// ============================================================================

/**
 * Starting balance for new users per chain (in base units)
 */
export const DEFAULT_STARTING_BALANCES: Record<Chain, bigint> = {
  solana: 10_000_000_000n,           // 10 SOL
  base: 10_000_000_000_000_000_000n, // 10 ETH
};

/**
 * Get display string for starting balance
 */
export function getDefaultBalanceDisplay(chain: Chain): string {
  const baseUnits = DEFAULT_STARTING_BALANCES[chain];
  const amount = formatFromBaseUnits(chain, baseUnits);
  const symbol = CHAIN_CONFIG[chain].nativeSymbol;
  return `${amount} ${symbol}`;
}

// ============================================================================
// SLIPPAGE CONFIGURATION
// ============================================================================

/**
 * Default slippage for trades (basis points: 100 = 1%)
 */
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

/**
 * Calculate execution price with slippage applied
 */
export function applySlippage(
  price: bigint, 
  slippageBps: number, 
  isBuy: boolean
): bigint {
  // For buys: price goes up (worse for buyer)
  // For sells: price goes down (worse for seller)
  const multiplier = isBuy 
    ? BigInt(10000 + slippageBps) 
    : BigInt(10000 - slippageBps);
  
  return (price * multiplier) / 10000n;
}

// ============================================================================
// BLOCK EXPLORER URLS
// ============================================================================

/**
 * Get block explorer URL for a transaction
 */
export function getTxExplorerUrl(chain: Chain, txHash: string): string {
  const config = CHAIN_CONFIG[chain];
  switch (chain) {
    case 'solana':
      return `${config.blockExplorerUrl}/tx/${txHash}`;
    case 'base':
      return `${config.blockExplorerUrl}/tx/${txHash}`;
    default:
      return '#';
  }
}

/**
 * Get block explorer URL for an address
 */
export function getAddressExplorerUrl(chain: Chain, address: string): string {
  const config = CHAIN_CONFIG[chain];
  switch (chain) {
    case 'solana':
      return `${config.blockExplorerUrl}/account/${address}`;
    case 'base':
      return `${config.blockExplorerUrl}/address/${address}`;
    default:
      return '#';
  }
}

/**
 * Get block explorer URL for a token
 */
export function getTokenExplorerUrl(chain: Chain, tokenAddress: string): string {
  const config = CHAIN_CONFIG[chain];
  switch (chain) {
    case 'solana':
      return `${config.blockExplorerUrl}/token/${tokenAddress}`;
    case 'base':
      return `${config.blockExplorerUrl}/token/${tokenAddress}`;
    default:
      return '#';
  }
}
