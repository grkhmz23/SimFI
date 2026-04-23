import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../../../db";
import { alphaDeskIdeaOutcomes, alphaDeskIdeas } from "@shared/schema";
import type { AlphaDeskChain } from "../types";

export async function recordOutcome(params: {
  ideaId: number;
  horizon: "1h" | "6h" | "24h" | "7d";
  priceUsd?: number;
  pctChange?: number;
}): Promise<void> {
  await db
    .insert(alphaDeskIdeaOutcomes)
    .values({
      ideaId: params.ideaId,
      horizon: params.horizon,
      priceUsd: params.priceUsd != null ? String(params.priceUsd) : null,
      pctChange: params.pctChange != null ? String(params.pctChange) : null,
      measuredAt: new Date(),
    })
    .onConflictDoNothing({
      target: [alphaDeskIdeaOutcomes.ideaId, alphaDeskIdeaOutcomes.horizon],
    });
}

export async function getUnmeasuredIdeas(
  chain: AlphaDeskChain,
  since: Date,
  horizon: "1h" | "6h" | "24h" | "7d"
): Promise<{ id: number; tokenAddress: string; priceAtPublishUsd: string | null }[]> {
  const ideas = await db
    .select({
      id: alphaDeskIdeas.id,
      tokenAddress: alphaDeskIdeas.tokenAddress,
      priceAtPublishUsd: alphaDeskIdeas.priceAtPublishUsd,
    })
    .from(alphaDeskIdeas)
    .where(and(
      eq(alphaDeskIdeas.chain, chain),
      sql`${alphaDeskIdeas.publishedAt} >= ${since}`
    ));

  // Only track outcomes for ideas that have an associated token address
  // (launch ideas that reference existing tokens, not pure concepts)
  const ideasWithTokens = ideas.filter((i) => i.tokenAddress != null);

  if (ideasWithTokens.length === 0) return [];

  const ideaIds = ideasWithTokens.map((i) => i.id);
  const measured = await db
    .select({ ideaId: alphaDeskIdeaOutcomes.ideaId })
    .from(alphaDeskIdeaOutcomes)
    .where(
      and(
        inArray(alphaDeskIdeaOutcomes.ideaId, ideaIds),
        eq(alphaDeskIdeaOutcomes.horizon, horizon)
      )
    );

  const measuredSet = new Set(measured.map((m) => m.ideaId));
  return ideasWithTokens
    .filter((i) => !measuredSet.has(i.id))
    .map((i) => ({
      id: i.id,
      tokenAddress: i.tokenAddress!, // Non-null because we filtered above
      priceAtPublishUsd: i.priceAtPublishUsd,
    }));
}
