// Token formatting utilities for multi-chain support
import type { Chain } from '@shared/schema';

// Constants
const LAMPORTS_PER_SOL = 1_000_000_000;
const WEI_PER_ETH = 1_000_000_000_000_000_000n;

// ============================================================================
// Solana Formatting
// ============================================================================

export function formatSol(lamports: bigint | number | string, decimals: number = 4): string {
  const value = typeof lamports === 'bigint' ? Number(lamports) : Number(lamports || 0);
  const sol = value / LAMPORTS_PER_SOL;
  return sol.toFixed(decimals);
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

// ============================================================================
// Base/ETH Formatting
// ============================================================================

export function formatEth(wei: bigint | number | string, decimals: number = 6): string {
  const value = typeof wei === 'bigint' ? wei : BigInt(Math.floor(Number(wei || 0)));
  const eth = Number(value) / 1e18;
  return eth.toFixed(decimals);
}

export function ethToWei(eth: number): bigint {
  return BigInt(Math.floor(eth * 1e18));
}

export function weiToEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

// ============================================================================
// Generic Chain Formatting
// ============================================================================

export function formatBalance(
  balance: bigint | number | string,
  chain: Chain,
  decimals: number = 4
): string {
  if (chain === 'solana') {
    return formatSol(balance, decimals);
  } else {
    return formatEth(balance, decimals);
  }
}

export function formatBalanceWithSymbol(
  balance: bigint | number | string,
  chain: Chain,
  decimals: number = 4
): string {
  const formatted = formatBalance(balance, chain, decimals);
  const symbol = chain === 'solana' ? 'SOL' : 'ETH';
  return `${formatted} ${symbol}`;
}

// ============================================================================
// Token Amount Formatting (for ERC-20/SPL tokens)
// ============================================================================

export function formatTokenAmount(
  amount: bigint | number | string,
  tokenDecimals: number = 6,
  displayDecimals: number = 2
): string {
  const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(Math.floor(Number(amount || 0)));
  const divisor = BigInt(10 ** tokenDecimals);
  const wholePart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;
  
  // Pad fractional part with leading zeros
  const paddedFraction = fractionalPart.toString().padStart(tokenDecimals, '0');
  const trimmedFraction = paddedFraction.slice(0, displayDecimals).replace(/0+$/, '');
  
  if (trimmedFraction) {
    return `${wholePart}.${trimmedFraction}`;
  }
  return wholePart.toString();
}

// Convert human-readable token amount to bigint
export function parseTokenAmount(amount: string, decimals: number = 6): bigint {
  const [whole = '0', fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFraction);
}

// ============================================================================
// USD Formatting
// ============================================================================

/**
 * Format native amount to USD
 * Backward compatible: can be called with (nativeAmount, decimals) for Solana-only
 * or (nativeAmount, nativePriceUSD, chain, decimals) for multi-chain
 */
export function formatUSD(
  nativeAmount: bigint | number | string,
  nativePriceUSDOrDecimals?: number | Chain,
  chainOrDecimals?: Chain | number,
  decimals: number = 2
): string {
  // Handle backward compatible call: formatUSD(amount, decimals)
  if (typeof nativePriceUSDOrDecimals === 'number' && nativePriceUSDOrDecimals < 10 && !chainOrDecimals) {
    const decimalsCount = nativePriceUSDOrDecimals;
    const nativeValue = typeof nativeAmount === 'bigint' 
      ? lamportsToSol(nativeAmount)
      : Number(nativeAmount);
    // Use a default SOL price of $0 (just format the raw value)
    return `$${nativeValue.toFixed(decimalsCount)}`;
  }
  
  // New multi-chain signature: formatUSD(amount, price, chain, decimals)
  const nativePriceUSD = typeof nativePriceUSDOrDecimals === 'number' ? nativePriceUSDOrDecimals : 0;
  const chain = typeof chainOrDecimals === 'string' ? chainOrDecimals : 'solana';
  
  const nativeValue = typeof nativeAmount === 'bigint' 
    ? (chain === 'solana' ? lamportsToSol(nativeAmount) : weiToEth(nativeAmount))
    : Number(nativeAmount);
  
  const usdValue = nativeValue * nativePriceUSD;
  return `$${usdValue.toFixed(decimals)}`;
}

// ============================================================================
// Price Formatting
// ============================================================================

export function formatPrice(price: number | string, decimals: number = 9): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (num === 0) return '0';
  if (num < 0.000001) return num.toExponential(4);
  return num.toFixed(decimals);
}

// ============================================================================
// Compact Number Formatting (for market cap, volume, etc.)
// ============================================================================

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toFixed(2);
}

// ============================================================================
// Percentage Formatting
// ============================================================================

export function formatPercentage(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

// ============================================================================
// Address Formatting
// ============================================================================

export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// ============================================================================
// Additional Helper Functions (Backward Compatibility)
// ============================================================================

// These functions existed in the old lamports.ts and are kept for compatibility
export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  return BigInt(Math.floor(Number(value || 0)));
}

export function formatPricePerToken(price: number, decimals: number = 9): string {
  if (price === 0) return '0';
  if (price < 0.000001) return price.toExponential(4);
  return price.toFixed(decimals);
}

export function formatPricePerTokenUSD(price: number, decimals: number = 6): string {
  if (price === 0) return '$0';
  if (price < 0.01) return `$${price.toExponential(2)}`;
  return `$${price.toFixed(decimals)}`;
}

// Legacy function names
export function lamportsToTokens(lamports: bigint, decimals: number = 9): string {
  return formatTokenAmount(lamports, decimals, 4);
}

export function lamportsToUSD(lamports: bigint, solPriceUSD: number): string {
  return formatUSD(lamports, solPriceUSD, 'solana');
}

// Multi-chain native token formatting (SOL/ETH)
export function formatNative(
  nativeAmount: bigint | number | string,
  chain: Chain,
  decimals: number = 4
): string {
  if (chain === 'solana') {
    return formatSol(nativeAmount, decimals);
  } else {
    return formatEth(nativeAmount, decimals);
  }
}

// Multi-chain native to token conversion
export function nativeToTokens(nativeAmount: bigint, tokenDecimals: number = 9): string {
  return formatTokenAmount(nativeAmount, tokenDecimals, 4);
}

// Multi-chain native to USD conversion
export function nativeToUSD(nativeAmount: bigint, nativePriceUSD: number, chain: Chain): string {
  return formatUSD(nativeAmount, nativePriceUSD, chain);
}

// ============================================================================
// Backward Compatibility
// ============================================================================

// Re-export for backward compatibility
export { formatSol as formatLamports, formatEth as formatWei };
