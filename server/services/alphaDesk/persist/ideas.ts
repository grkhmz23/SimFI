import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import { alphaDeskIdeas } from "@shared/schema";
import type { AlphaDeskIdeaGenerated } from "../types";

export async function insertAlphaDeskIdeas(
  runId: number,
  ideas: AlphaDeskIdeaGenerated[]
): Promise<void> {
  if (ideas.length === 0) return;

  await db.insert(alphaDeskIdeas).values(
    ideas.map((idea) => {
      const base = {
        runId,
        rank: idea.rank,
        chain: idea.chain,
        ideaType: idea.ideaType,
        title: idea.title,
        confidenceScore: String(idea.confidence),
        riskFlags: idea.ideaType === "meme_launch" ? idea.riskFlags : [],
        publishedAt: new Date(),
      };

      if (idea.ideaType === "meme_launch") {
        return {
          ...base,
          name: idea.tokenName,
          symbol: idea.ticker,
          narrativeThesis: idea.thesis,
          whyNow: idea.whyNow,
          tokenAddress: idea.tokenAddress ?? null,
          priceAtPublishUsd: idea.priceAtPublishUsd != null ? String(idea.priceAtPublishUsd) : null,
          evidence: {
            memeTheme: idea.memeTheme,
            redditInspiration: idea.redditInspiration,
            twitterNarrative: idea.twitterNarrative,
            marketSignal: idea.marketSignal,
            category: idea.category,
            riskLevel: idea.riskLevel,
          },
        };
      }

      // dev_build
      return {
        ...base,
        name: idea.projectName,
        symbol: null,
        narrativeThesis: idea.concept,
        whyNow: idea.whyNow,
        evidence: {
          targetAudience: idea.targetAudience,
          suggestedStack: idea.suggestedStack,
          complexity: idea.complexity,
          monetization: idea.monetization,
          evidence: idea.evidence,
        },
      };
    })
  );
}

export async function getIdeasForRun(runId: number) {
  return db
    .select()
    .from(alphaDeskIdeas)
    .where(eq(alphaDeskIdeas.runId, runId))
    .orderBy(alphaDeskIdeas.rank);
}

export async function getIdeasByType(runId: number, ideaType: "meme_launch" | "dev_build") {
  return db
    .select()
    .from(alphaDeskIdeas)
    .where(and(eq(alphaDeskIdeas.runId, runId), eq(alphaDeskIdeas.ideaType, ideaType)))
    .orderBy(alphaDeskIdeas.rank);
}
