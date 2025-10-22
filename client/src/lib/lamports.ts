// 1 SOL = 1,000,000,000 Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const LAMPORTS_PER_SOL_BIGINT = BigInt(LAMPORTS_PER_SOL);

// Default decimals for pump.fun tokens
export const DEFAULT_TOKEN_DECIMALS = 6;

// Convert any input to BigInt (handles strings from API)
export function toBigInt(value: number | bigint | string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') return BigInt(value);
  return BigInt(Math.floor(value));
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
// Approximate SOL price in USD (can be updated or fetched from API)
export const SOL_PRICE_USD = 175; // Update this value as needed

// Convert lamports to USD
export function lamportsToUSD(lamports: number | bigint | string): number {
  const solAmount = lamportsToSol(lamports);
  return solAmount * SOL_PRICE_USD;
}

// Format lamports as USD with $ symbol
export function formatUSD(lamports: number | bigint | string, decimals: number = 4): string {
  const usdAmount = lamportsToUSD(lamports);
  if (usdAmount < 0.01 && usdAmount > 0) {
    return `$${usdAmount.toFixed(6)}`;
  }
  return `$${usdAmount.toFixed(decimals)}`;
}
