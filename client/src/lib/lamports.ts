// 1 SOL = 1,000,000,000 Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000;

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function formatSol(lamports: number, decimals: number = 4): string {
  return lamportsToSol(lamports).toFixed(decimals);
}

export function formatSolWithSymbol(lamports: number, decimals: number = 4): string {
  return `${formatSol(lamports, decimals)} SOL`;
}
