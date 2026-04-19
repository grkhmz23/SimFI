import type {
  ScoredToken,
  RedditPost,
  SocialDataTweet,
  GithubSignal,
  MemeLaunchIdeaGenerated,
  DevBuildIdeaGenerated,
  AlphaDeskIdeaGenerated,
  Chain,
} from "../types";
import { callLLM, parseJsonFromLlmWithRepair } from "./client";
import {
  buildMemeLaunchSystemPrompt,
  buildMemeLaunchUserPrompt,
  buildDevBuildSystemPrompt,
  buildDevBuildUserPrompt,
} from "./prompts";
import { MemeLaunchResponseSchema, DevBuildResponseSchema } from "./schemas";

interface IngestData {
  periodLabel: string;
  chain: Chain;
  tokens: ScoredToken[];
  redditPosts: RedditPost[];
  tweets: SocialDataTweet[];
  githubSignals: GithubSignal[];
}

export async function generateMemeLaunchIdeas(
  input: IngestData
): Promise<MemeLaunchIdeaGenerated[]> {
  const systemPrompt = buildMemeLaunchSystemPrompt();
  const userPrompt = buildMemeLaunchUserPrompt(
    input.periodLabel,
    input.chain,
    input.tokens,
    input.redditPosts,
    input.tweets,
    input.githubSignals
  );

  const raw = await callLLM({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.5,
  });

  const parsed = (await parseJsonFromLlmWithRepair(
    raw,
    MemeLaunchResponseSchema,
    "meme-launch-ideas"
  )) as { ideas: Array<Record<string, unknown>> };

  const ideas = parsed.ideas.slice(0, 5).map((idea, idx): MemeLaunchIdeaGenerated => {
    return {
      ideaType: "meme_launch",
      rank: idx + 1,
      title: String(idea.title ?? ""),
      tokenName: String(idea.token_name ?? ""),
      ticker: String(idea.ticker ?? "").toUpperCase().slice(0, 10),
      thesis: String(idea.thesis ?? ""),
      whyNow: String(idea.why_now ?? ""),
      memeTheme: String(idea.meme_theme ?? ""),
      redditInspiration: Array.isArray(idea.reddit_inspiration)
        ? idea.reddit_inspiration.filter((s): s is string => typeof s === "string")
        : [],
      twitterNarrative: String(idea.twitter_narrative ?? ""),
      marketSignal: String(idea.market_signal ?? ""),
      riskFlags: Array.isArray(idea.risk_flags)
        ? idea.risk_flags.filter((s): s is string => typeof s === "string")
        : [],
      confidence: Math.max(0, Math.min(100, Number(idea.confidence ?? 0))),
      chain: input.chain,
      category: ["meme", "culture", "political", "tech"].includes(String(idea.category))
        ? (String(idea.category) as "meme" | "culture" | "political" | "tech")
        : "meme",
      riskLevel: ["low", "medium", "high"].includes(String(idea.risk_level))
        ? (String(idea.risk_level) as "low" | "medium" | "high")
        : "medium",
    };
  });

  if (ideas.length < 3) {
    throw new Error(`Expected at least 3 meme launch ideas, got ${ideas.length}`);
  }

  return ideas;
}

export async function generateDevBuildIdeas(
  input: IngestData
): Promise<DevBuildIdeaGenerated[]> {
  const systemPrompt = buildDevBuildSystemPrompt();
  const userPrompt = buildDevBuildUserPrompt(
    input.periodLabel,
    input.chain,
    input.tokens,
    input.redditPosts,
    input.tweets,
    input.githubSignals
  );

  const raw = await callLLM({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.4,
  });

  const parsed = (await parseJsonFromLlmWithRepair(
    raw,
    DevBuildResponseSchema,
    "dev-build-ideas"
  )) as { ideas: Array<Record<string, unknown>> };

  const ideas = parsed.ideas.slice(0, 5).map((idea, idx): DevBuildIdeaGenerated => {
    return {
      ideaType: "dev_build",
      rank: idx + 1,
      title: String(idea.title ?? ""),
      projectName: String(idea.project_name ?? ""),
      concept: String(idea.concept ?? ""),
      whyNow: String(idea.why_now ?? ""),
      targetAudience: String(idea.target_audience ?? ""),
      suggestedStack: Array.isArray(idea.suggested_stack)
        ? idea.suggested_stack.filter((s): s is string => typeof s === "string")
        : [],
      complexity: ["weekend", "sprint", "quarter"].includes(String(idea.complexity))
        ? (String(idea.complexity) as "weekend" | "sprint" | "quarter")
        : "sprint",
      monetization: String(idea.monetization ?? ""),
      chain: input.chain,
      confidence: Math.max(0, Math.min(100, Number(idea.confidence ?? 0))),
      evidence: Array.isArray(idea.evidence)
        ? idea.evidence.filter((s): s is string => typeof s === "string")
        : [],
    };
  });

  if (ideas.length < 3) {
    throw new Error(`Expected at least 3 dev build ideas, got ${ideas.length}`);
  }

  return ideas;
}

export async function generateAlphaDeskIdeas(
  input: IngestData
): Promise<AlphaDeskIdeaGenerated[]> {
  const [memeIdeas, devIdeas] = await Promise.all([
    generateMemeLaunchIdeas(input),
    generateDevBuildIdeas(input),
  ]);

  return [...memeIdeas, ...devIdeas];
}
