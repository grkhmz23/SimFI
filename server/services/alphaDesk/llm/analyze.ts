import type { ScoredToken, AlphaDeskIdeaGenerated, AlphaDeskIdeaInput } from "../types";
import { callLLM, parseJsonFromLlmWithRepair } from "./client";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { AlphaDeskIdeasResponseSchema } from "./schemas";

export async function generateAlphaDeskIdeas(
  input: AlphaDeskIdeaInput
): Promise<AlphaDeskIdeaGenerated[]> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(
    input.periodLabel,
    input.tokens,
    input.worldNews ?? []
  );

  const raw = await callLLM({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.4,
  });

  const parsed = (await parseJsonFromLlmWithRepair(
    raw,
    AlphaDeskIdeasResponseSchema,
    "alpha-desk-ideas"
  )) as { ideas: Array<Record<string, unknown>> };

  const ideas = parsed.ideas.slice(0, 3).map((idea, idx): AlphaDeskIdeaGenerated => {
    const rawChain = idea.chain;
    const chain = rawChain === "solana" ? "solana" : "base";

    return {
      narrativeTitle: String(idea.narrative_title ?? ""),
      tokenName: String(idea.token_name ?? ""),
      ticker: String(idea.ticker ?? "").toUpperCase(),
      thesis: String(idea.thesis ?? ""),
      whyNow: String(idea.why_now ?? ""),
      twitterEvidence: Array.isArray(idea.twitter_evidence)
        ? idea.twitter_evidence.filter((s): s is string => typeof s === "string")
        : [],
      riskFlags: Array.isArray(idea.risk_flags)
        ? idea.risk_flags.filter((s): s is string => typeof s === "string")
        : [],
      confidence: Math.max(0, Math.min(100, Number(idea.confidence ?? 0))),
      chain,
      tokenAddress: String(idea.token_address ?? ""),
      category: idea.category === "utility" ? "utility" : "meme",
      riskLevel: ["low", "medium", "high"].includes(String(idea.risk_level))
        ? (String(idea.risk_level) as "low" | "medium" | "high")
        : "medium",
      rank: idx + 1,
    };
  });

  if (ideas.length !== 3) {
    throw new Error(`Expected 3 ideas, got ${ideas.length}`);
  }

  return ideas;
}
