// 1 SOL = 1,000,000,000 Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const LAMPORTS_PER_SOL_BIGINT = BigInt(LAMPORTS_PER_SOL);

// Default decimals for pump.fun tokens
export const DEFAULT_TOKEN_DECIMALS = 6;

// Convert any input to BigInt (handles strings from API)
export function toBigInt(value: number | bigint | string | null | undefined): bigint {
  if (value === null || value === undefined) return BigInt(0);
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') {
    if (value === '' || value === 'null' || value === 'undefined') return BigInt(0);
    try {
      return BigInt(value);
    } catch {
      // Invalid string format, return 0
      return BigInt(0);
    }
  }
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) return BigInt(0);
    return BigInt(Math.floor(value));
  }
  return BigInt(0);
}

// Convert token smallest units to decimal amount (BigInt → string, no precision loss)
export function lamportsToTokens(lamports: number | bigint | string, decimals: number = DEFAULT_TOKEN_DECIMALS): string {
  const value = toBigInt(lamports);
  if (value === 0n) return '0';
  
  const divisor = BigInt(10 ** decimals);
  const wholePart = value / divisor;
  const fractionalPart = value % divisor;
  
  if (fractionalPart === 0n) {
    return wholePart.toString();
  }
  
  // Convert to decimal string and trim trailing zeros
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${wholePart}.${fractionalStr}`;
}

// Convert lamports to SOL for display (converts to Number - use only for display!)
export function lamportsToSol(lamports: number | bigint | string): number {
  const value = toBigInt(lamports);
  return Number(value) / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function formatSol(lamports: number | bigint | string, decimals: number = 4): string {
  return lamportsToSol(lamports).toFixed(decimals);
}

export function formatSolWithSymbol(lamports: number | bigint | string, decimals: number = 4): string {
  return `${formatSol(lamports, decimals)} SOL`;
}

// Format token amount with proper precision (no Number conversion)
// displayDecimals: how many decimal places to show (default 2)
// tokenDecimals: the token's actual decimals (6 for pump.fun, 9 for SOL)
export function formatTokenAmount(amount: number | bigint | string, displayDecimals: number = 2, tokenDecimals: number = DEFAULT_TOKEN_DECIMALS): string {
  const tokenStr = lamportsToTokens(amount, tokenDecimals);
  const [whole, frac = ''] = tokenStr.split('.');
  if (displayDecimals === 0) return whole;
  const paddedFrac = frac.padEnd(displayDecimals, '0');
  return `${whole}.${paddedFrac.slice(0, displayDecimals)}`;
}

// USD conversion functions
// NOTE: SOL_PRICE_USD should be obtained from useSolPrice() hook in React components
// For non-React utility functions, use a default fallback value
let dynamicSolPriceUSD = 140;

export function setSolPrice(price: number) {
  dynamicSolPriceUSD = price;
}

export function getSolPrice(): number {
  return dynamicSolPriceUSD;
}

// DEPRECATED: Use useSolPrice() hook in React components instead
export const SOL_PRICE_USD = 140;

// Convert lamports to USD (uses dynamic price if available, fallback to 140)
export function lamportsToUSD(lamports: number | bigint | string, solPrice?: number): number {
  const solAmount = lamportsToSol(lamports);
  const price = solPrice || dynamicSolPriceUSD || 140;
  return solAmount * price;
}

// Format lamports as USD with $ symbol
export function formatUSD(lamports: number | bigint | string, decimals: number = 4, solPrice?: number): string {
  const usdAmount = lamportsToUSD(lamports, solPrice);
  if (usdAmount < 0.01 && usdAmount > 0) {
    return `$${usdAmount.toFixed(6)}`;
  }
  return `$${usdAmount.toFixed(decimals)}`;
}

// Format price per token (lamports per whole token → SOL per whole token)
// Input: lamports per whole token (e.g., 1,396 lamports)
// Output: SOL per whole token (e.g., "0.000001396 SOL")
export function formatPricePerToken(lamportsPerToken: number | bigint | string, decimals: number = 9): string {
  const value = toBigInt(lamportsPerToken);
  const solPerToken = Number(value) / LAMPORTS_PER_SOL;
  return solPerToken.toFixed(decimals);
}

// Format price per token in USD
// Input: lamports per whole token
// Output: USD price (e.g., "$0.195")
export function formatPricePerTokenUSD(lamportsPerToken: number | bigint | string, decimals: number = 6, solPrice?: number): string {
  const value = toBigInt(lamportsPerToken);
  const solPerToken = Number(value) / LAMPORTS_PER_SOL;
  const price = solPrice || dynamicSolPriceUSD || 140;
  const usdPrice = solPerToken * price;
  if (usdPrice < 0.00001 && usdPrice > 0) {
    return `$${usdPrice.toFixed(9)}`;
  }
  return `$${usdPrice.toFixed(decimals)}`;
}
