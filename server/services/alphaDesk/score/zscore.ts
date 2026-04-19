export function zScore(current: number, baseline: number): number {
  if (baseline === 0) return current > 0 ? 2.0 : 0;
  const z = (current - baseline) / Math.max(baseline, 0.001);
  return Math.max(-5, Math.min(5, z));
}

export function computeZScores(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
  if (std === 0) return values.map(() => 0);
  return values.map((v) => Math.max(-5, Math.min(5, (v - mean) / std)));
}
