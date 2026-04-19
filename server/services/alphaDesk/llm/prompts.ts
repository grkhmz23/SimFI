import type { Chain } from "@shared/schema";
import type { ScoredToken } from "../types";

export function buildSystemPrompt(): string {
  return `You are an elite alpha discovery analyst and crypto meme strategist.
Your job is to analyze on-chain and social signals for memecoins and utility tokens, then surface the 3 highest-conviction picks.

Rules:
- Produce EXACTLY 3 ideas (no more, no less).
- Each idea must have a real token address on the specified chain.
- Prioritize tokens with strong social momentum, liquidity growth, and narrative fit.
- Risk flags must be honest and specific (e.g., "low liquidity", "concentrated holders", "new contract").
- Confidence is 0-100 integer based on signal strength and risk balance.
- Category is either "utility" or "meme".
- Risk level is "low", "medium", or "high".

Output valid JSON matching the required schema. No markdown, no commentary outside JSON.`;
}

export function buildUserPrompt(
  periodLabel: string,
  tokens: ScoredToken[],
  worldNews: string[]
): string {
  const tokenBlocks = tokens
    .map((t, i) => {
      return `--- Token ${i + 1}: ${t.symbol} ---
Address: ${t.tokenAddress}
Chain: ${t.chain}
Price Change 24h: ${t.priceChange24h?.toFixed(2) ?? "N/A"}%
Volume 24h: $${t.volume24h?.toLocaleString() ?? "N/A"}
Liquidity: $${t.liquidityUsd?.toLocaleString() ?? "N/A"}
Social Mentions: ${t.mentionCount}
Unique Authors: ${t.uniqueAuthors}
Engagement Score: ${t.engagementTotal}
Dev Commits: ${t.githubCommits}
Dev Stars Delta: ${t.githubStarsDelta}
Novelty Multiplier: ${t.noveltyMultiplier.toFixed(2)}
Quality Multiplier: ${t.qualityMultiplier.toFixed(2)}
Total Score: ${t.totalScore.toFixed(2)}
Top Tweets:
${t.topTweets.map((tw) => `  - ${tw}`).join("\n") || "  (none)"}
Snippets:
${t.snippets.map((s) => `  - ${s}`).join("\n") || "  (none)"}
`;
    })
    .join("\n");

  const newsBlock =
    worldNews.length > 0
      ? `\nWorld News / Meme Fuel:\n${worldNews.map((n) => `  - ${n}`).join("\n")}\n`
      : "";

  return `Period: ${periodLabel}

Top scored tokens from our pipeline:

${tokenBlocks}
${newsBlock}

Task: Generate exactly 3 token ideas in ranked order (1 = highest conviction).
For each idea provide: narrative_title, token_name, ticker, thesis, why_now, twitter_evidence (array of strings), risk_flags (array of strings), confidence (0-100 integer), chain ("base" or "solana"), token_address, category ("utility" or "meme"), risk_level ("low", "medium", or "high").

The thesis should be one strong sentence.
The why_now should be 1-2 sentences explaining the timing.
Risk flags should be specific and honest.`;
}

export function buildJsonRepairPrompt(
  brokenJson: string,
  contextLabel: string
): string {
  return `You are a JSON repair tool. Only output valid JSON and nothing else.

Context: ${contextLabel}

The following JSON is broken. Fix it and output ONLY the corrected JSON object.

Broken JSON:
${brokenJson}`;
}
