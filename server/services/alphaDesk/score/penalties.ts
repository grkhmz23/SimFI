export function computeHypeOnlyPenalty(snippets: string[]): number {
  if (snippets.length === 0) return 1.0;
  const hypeCount = snippets.filter((s) =>
    /moon|lambo|pump|dump|wagmi|hodl|gem|100x|1000x|pnd/i.test(s)
  ).length;
  const hypeRatio = hypeCount / snippets.length;
  return hypeRatio > 0.8 ? 0.7 : 1.0;
}
