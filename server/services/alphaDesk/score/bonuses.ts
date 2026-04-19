export function computeNoveltyBonus(daysOld: number): number {
  if (daysOld <= 0) return 1.3;
  if (daysOld >= 60) return 1.0;
  return 1.3 - 0.3 * (daysOld / 60);
}

export function computeCrossChainBonus(chainCount: number): number {
  // Dropped for Alpha Desk v1 (only 2 chains)
  return 1.0;
}
