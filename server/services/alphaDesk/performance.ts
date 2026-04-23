import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../../db";
import { alphaDeskRuns, alphaDeskIdeas, alphaDeskIdeaOutcomes } from "@shared/schema";
import type { AlphaDeskChain } from "./types";

const HORIZONS = ["1h", "6h", "24h", "7d"] as const;
type Horizon = (typeof HORIZONS)[number];

interface HorizonStats {
  horizon: Horizon;
  totalTracked: number;
  profitableCount: number;
  hitRate: number; // 0-100
  avgReturn: number; // percent
  medianReturn: number; // percent
  bestReturn: number; // percent
  worstReturn: number; // percent
}

interface IdeaWithOutcomes {
  id: number;
  runDate: string;
  symbol: string | null;
  name: string;
  chain: string;
  ideaType: string;
  confidenceScore: string;
  priceAtPublishUsd: string | null;
  publishedAt: Date;
  outcomes: Array<{
    horizon: string;
    priceUsd: string | null;
    pctChange: string | null;
    measuredAt: Date;
  }>;
}

interface PerformanceSummary {
  chain: string;
  totalIdeas: number;
  ideasWithOutcomes: number;
  horizonStats: HorizonStats[];
  bestPick: { symbol: string | null; name: string; return: number; horizon: Horizon } | null;
  worstPick: { symbol: string | null; name: string; return: number; horizon: Horizon } | null;
  picks: IdeaWithOutcomes[];
}

export async function getPerformanceSummary(chain: AlphaDeskChain): Promise<PerformanceSummary> {
  // Get all succeeded runs for this chain
  const runs = await db
    .select()
    .from(alphaDeskRuns)
    .where(and(eq(alphaDeskRuns.chain, chain), eq(alphaDeskRuns.status, "succeeded")));

  const runIds = runs.map((r) => r.id);

  if (runIds.length === 0) {
    return {
      chain,
      totalIdeas: 0,
      ideasWithOutcomes: 0,
      horizonStats: HORIZONS.map((h) => ({
        horizon: h,
        totalTracked: 0,
        profitableCount: 0,
        hitRate: 0,
        avgReturn: 0,
        medianReturn: 0,
        bestReturn: 0,
        worstReturn: 0,
      })),
      bestPick: null,
      worstPick: null,
      picks: [],
    };
  }

  // Get all trackable ideas (meme ideas with token addresses) from these runs
  const ideas = await db
    .select()
    .from(alphaDeskIdeas)
    .where(sql`${alphaDeskIdeas.runId} IN (${sql.join(runIds, sql`, `)})`)
    .orderBy(desc(alphaDeskIdeas.publishedAt));

  // Only track meme ideas that have a token address (existing tokens)
  const trackableIdeas = ideas.filter((i) => i.ideaType === "meme_launch" && i.tokenAddress);

  if (trackableIdeas.length === 0) {
    return {
      chain,
      totalIdeas: ideas.length,
      ideasWithOutcomes: 0,
      horizonStats: HORIZONS.map((h) => ({
        horizon: h,
        totalTracked: 0,
        profitableCount: 0,
        hitRate: 0,
        avgReturn: 0,
        medianReturn: 0,
        bestReturn: 0,
        worstReturn: 0,
      })),
      bestPick: null,
      worstPick: null,
      picks: [],
    };
  }

  const ideaIds = trackableIdeas.map((i) => i.id);

  // Fetch all outcomes for these ideas
  const outcomes = await db
    .select()
    .from(alphaDeskIdeaOutcomes)
    .where(sql`${alphaDeskIdeaOutcomes.ideaId} IN (${sql.join(ideaIds, sql`, `)})`);

  // Group outcomes by idea
  const outcomesByIdea = new Map<number, typeof outcomes>();
  for (const o of outcomes) {
    if (!outcomesByIdea.has(o.ideaId)) outcomesByIdea.set(o.ideaId, []);
    outcomesByIdea.get(o.ideaId)!.push(o);
  }

  // Build picks with outcomes
  const runDateMap = new Map(runs.map((r) => [r.id, r.runDate]));

  const picks: IdeaWithOutcomes[] = trackableIdeas.map((idea) => {
    const ideaOutcomes = outcomesByIdea.get(idea.id) ?? [];
    return {
      id: idea.id,
      runDate: runDateMap.get(idea.runId) ?? idea.publishedAt.toISOString().split("T")[0],
      symbol: idea.symbol,
      name: idea.name ?? idea.title,
      chain: idea.chain,
      ideaType: idea.ideaType,
      confidenceScore: idea.confidenceScore,
      priceAtPublishUsd: idea.priceAtPublishUsd,
      publishedAt: idea.publishedAt,
      outcomes: ideaOutcomes.map((o) => ({
        horizon: o.horizon,
        priceUsd: o.priceUsd,
        pctChange: o.pctChange,
        measuredAt: o.measuredAt,
      })),
    };
  });

  // Per-horizon stats
  const horizonStats: HorizonStats[] = HORIZONS.map((horizon) => {
    const horizonReturns: number[] = [];
    let profitableCount = 0;
    let bestReturn = -Infinity;
    let worstReturn = Infinity;
    let bestPickLocal: { symbol: string | null; name: string; return: number } | null = null;
    let worstPickLocal: { symbol: string | null; name: string; return: number } | null = null;

    for (const pick of picks) {
      const outcome = pick.outcomes.find((o) => o.horizon === horizon);
      if (!outcome || outcome.pctChange == null) continue;

      const pct = parseFloat(outcome.pctChange);
      horizonReturns.push(pct);

      if (pct > 0) profitableCount++;

      if (pct > bestReturn) {
        bestReturn = pct;
        bestPickLocal = { symbol: pick.symbol, name: pick.name, return: pct };
      }
      if (pct < worstReturn) {
        worstReturn = pct;
        worstPickLocal = { symbol: pick.symbol, name: pick.name, return: pct };
      }
    }

    const sorted = [...horizonReturns].sort((a, b) => a - b);
    const median =
      sorted.length === 0
        ? 0
        : sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];

    const avg =
      horizonReturns.length > 0
        ? horizonReturns.reduce((a, b) => a + b, 0) / horizonReturns.length
        : 0;

    return {
      horizon,
      totalTracked: horizonReturns.length,
      profitableCount,
      hitRate: horizonReturns.length ? Math.round((profitableCount / horizonReturns.length) * 100) : 0,
      avgReturn: Math.round(avg * 100) / 100,
      medianReturn: Math.round(median * 100) / 100,
      bestReturn: bestReturn === -Infinity ? 0 : Math.round(bestReturn * 100) / 100,
      worstReturn: worstReturn === Infinity ? 0 : Math.round(worstReturn * 100) / 100,
    };
  });

  // Overall best/worst pick across all horizons
  let bestPick: { symbol: string | null; name: string; return: number; horizon: Horizon } | null = null;
  let worstPick: { symbol: string | null; name: string; return: number; horizon: Horizon } | null = null;

  for (const h of HORIZONS) {
    const stat = horizonStats.find((s) => s.horizon === h);
    if (!stat || stat.totalTracked === 0) continue;
    if (stat.bestReturn > (bestPick?.return ?? -Infinity)) {
      // Find the actual pick for this best return (compare rounded values)
      for (const pick of picks) {
        const o = pick.outcomes.find((o) => o.horizon === h);
        if (o && o.pctChange != null) {
          const roundedPct = Math.round(parseFloat(o.pctChange) * 100) / 100;
          if (roundedPct === stat.bestReturn) {
            bestPick = { symbol: pick.symbol, name: pick.name, return: stat.bestReturn, horizon: h };
            break;
          }
        }
      }
    }
    if (stat.worstReturn < (worstPick?.return ?? Infinity)) {
      for (const pick of picks) {
        const o = pick.outcomes.find((o) => o.horizon === h);
        if (o && o.pctChange != null) {
          const roundedPct = Math.round(parseFloat(o.pctChange) * 100) / 100;
          if (roundedPct === stat.worstReturn) {
            worstPick = { symbol: pick.symbol, name: pick.name, return: stat.worstReturn, horizon: h };
            break;
          }
        }
      }
    }
  }

  return {
    chain,
    totalIdeas: ideas.length,
    ideasWithOutcomes: picks.filter((p) => p.outcomes.length > 0).length,
    horizonStats,
    bestPick,
    worstPick,
    picks,
  };
}

interface TrajectoryPoint {
  horizon: Horizon;
  priceUsd: number | null;
  pctChange: number | null;
  measuredAt: Date | null;
}

export interface IdeaTrajectory {
  idea: {
    id: number;
    symbol: string | null;
    name: string;
    chain: string;
    confidenceScore: string;
    priceAtPublishUsd: string | null;
    publishedAt: Date;
    narrativeThesis: string;
  };
  trajectory: TrajectoryPoint[];
}

export async function getIdeaTrajectory(ideaId: number): Promise<IdeaTrajectory | null> {
  const [idea] = await db
    .select()
    .from(alphaDeskIdeas)
    .where(eq(alphaDeskIdeas.id, ideaId))
    .limit(1);

  if (!idea) return null;

  const outcomes = await db
    .select()
    .from(alphaDeskIdeaOutcomes)
    .where(eq(alphaDeskIdeaOutcomes.ideaId, ideaId));

  const trajectory: TrajectoryPoint[] = HORIZONS.map((horizon) => {
    const o = outcomes.find((o) => o.horizon === horizon);
    return {
      horizon,
      priceUsd: o?.priceUsd != null ? parseFloat(o.priceUsd) : null,
      pctChange: o?.pctChange != null ? parseFloat(o.pctChange) : null,
      measuredAt: o?.measuredAt ?? null,
    };
  });

  return {
    idea: {
      id: idea.id,
      symbol: idea.symbol,
      name: idea.name ?? idea.title,
      chain: idea.chain,
      confidenceScore: idea.confidenceScore,
      priceAtPublishUsd: idea.priceAtPublishUsd,
      publishedAt: idea.publishedAt,
      narrativeThesis: idea.narrativeThesis,
    },
    trajectory,
  };
}
