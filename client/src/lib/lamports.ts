// 1 SOL = 1,000,000,000 Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000;

export function lamportsToSol(lamports: number | bigint | string): number {
  const value = typeof lamports === 'string' ? BigInt(lamports) : lamports;
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
