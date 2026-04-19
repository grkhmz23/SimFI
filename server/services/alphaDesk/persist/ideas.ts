import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { alphaDeskIdeas } from "@shared/schema";
import type { AlphaDeskIdeaGenerated } from "../types";

export async function insertAlphaDeskIdeas(
  runId: number,
  ideas: AlphaDeskIdeaGenerated[],
  priceAtPublishUsd?: number,
  priceAtPublishNative?: number
): Promise<void> {
  if (ideas.length === 0) return;

  await db.insert(alphaDeskIdeas).values(
    ideas.map((idea) => ({
      runId,
      rank: idea.rank,
      chain: idea.chain,
      tokenAddress: idea.tokenAddress,
      symbol: idea.ticker,
      name: idea.tokenName,
      narrativeThesis: idea.thesis,
      whyNow: idea.whyNow,
      confidenceScore: String(idea.confidence),
      riskFlags: idea.riskFlags,
      evidence: {
        tweets: idea.twitterEvidence,
        narrativeTitle: idea.narrativeTitle,
        category: idea.category,
        riskLevel: idea.riskLevel,
      },
      priceAtPublishUsd: priceAtPublishUsd != null ? String(priceAtPublishUsd) : null,
      priceAtPublishNative: priceAtPublishNative != null ? String(priceAtPublishNative) : null,
    }))
  );
}

export async function getIdeasForRun(runId: number) {
  return db
    .select()
    .from(alphaDeskIdeas)
    .where(eq(alphaDeskIdeas.runId, runId))
    .orderBy(alphaDeskIdeas.rank);
}
