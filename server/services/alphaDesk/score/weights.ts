export interface Weights {
  dev: number;
  social: number;
  market: number;
}

export function resolveWeights(hasGithub: boolean, hasSocialData: boolean): Weights {
  if (hasGithub && hasSocialData) {
    // Full mode: 50% dev / 35% social / 15% market
    return { dev: 0.50, social: 0.35, market: 0.15 };
  }
  if (!hasGithub && hasSocialData) {
    // Degraded: GitHub missing → redistribute dev to social+market
    // 0% dev / 75% social / 25% market
    return { dev: 0.00, social: 0.75, market: 0.25 };
  }
  if (hasGithub && !hasSocialData) {
    // Degraded: SocialData missing → redistribute social to dev+market
    // 75% dev / 0% social / 25% market
    return { dev: 0.75, social: 0.00, market: 0.25 };
  }
  // Both missing — unlikely but possible in dry-run
  return { dev: 0.00, social: 0.00, market: 1.00 };
}
