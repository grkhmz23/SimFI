// server/services/alphaDesk/index.ts
// Main entry: runDailyPipeline(chain) — generates meme launch ideas + dev build ideas.

import type { Chain } from "@shared/schema";
import type { ScoredToken, AlphaDeskIdeaGenerated, PipelineContext } from "./types";
import { fetchTrendingTokens, fetchTokenProfiles } from "./ingest/dexscreener";
import { ingestTwitterSignals } from "./ingest/socialdata";
import { ingestGithubSignals } from "./ingest/github";
import { ingestRedditSignals } from "./ingest/reddit";
import { resolveWeights } from "./score/weights";
import { zScore } from "./score/zscore";
import { computeNoveltyBonus } from "./score/bonuses";
import { computeHypeOnlyPenalty } from "./score/penalties";
import { generateAlphaDeskIdeas } from "./llm/analyze";
import { getLlmProviderInfo } from "./llm/client";
import { insertAlphaDeskRun, updateAlphaDeskRun, findTodayRun, countRunsToday } from "./persist/runs";
import { insertAlphaDeskIdeas } from "./persist/ideas";

const MAX_RUNS_PER_DAY = parseInt(process.env.ALPHA_DESK_MAX_RUNS_PER_DAY || "2", 10);

function formatDateIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getPeriodDates(): { since: string; until: string; periodLabel: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since = formatDateIso(yesterday);
  const until = formatDateIso(now);
  return { since, until, periodLabel: `${since} → ${until}` };
}

export async function runDailyPipeline(chain: Chain): Promise<{ runId: number; memeCount: number; devCount: number }> {
  const runDate = formatDateIso(new Date());
  const { since, until, periodLabel } = getPeriodDates();

  // Idempotency: check if today's run already exists (any status)
  const existing = await findTodayRun(runDate, chain);
  if (existing) {
    if (existing.status === "succeeded") {
      console.log(`[AlphaDesk] Run already succeeded for ${runDate} / ${chain}, skipping`);
    } else {
      console.log(`[AlphaDesk] Run already exists for ${runDate} / ${chain} (status=${existing.status}), skipping`);
    }
    return { runId: existing.id, memeCount: 0, devCount: 0 };
  }

  // Cost guard
  const runCount = await countRunsToday(runDate, chain);
  if (runCount >= MAX_RUNS_PER_DAY) {
    throw new Error(`Alpha Desk run limit exceeded for ${runDate} / ${chain} (${MAX_RUNS_PER_DAY})`);
  }

  const context: PipelineContext = {
    chain,
    runDate,
    sourcesUsed: {},
  };

  const runId = await insertAlphaDeskRun({
    runDate,
    chain,
    status: "pending",
    sourcesUsed: context.sourcesUsed,
  });

  try {
    console.log(`[AlphaDesk] Starting pipeline for ${chain}, runId=${runId}`);

    // === Ingestion ===
    const [trendingRaw, twitterResult, redditPosts] = await Promise.all([
      fetchTrendingTokens(chain, 30),
      ingestTwitterSignals(chain, since, until),
      ingestRedditSignals(),
    ]);

    context.sourcesUsed["dexscreener"] = true;
    context.sourcesUsed["socialdata"] = !!process.env.SOCIALDATA_API_KEY;
    context.sourcesUsed["reddit"] = redditPosts.length > 0;

    const tokensWithProfiles = await fetchTokenProfiles(trendingRaw);

    // GitHub signals (optional)
    const githubSignals = await ingestGithubSignals(
      chain === "solana"
        ? ["solana-labs/solana", "metaplex-foundation/metaplex"]
        : ["base-org/node", "coinbase/smart-wallet"],
      since,
      until
    );
    context.sourcesUsed["github"] = githubSignals.length > 0;

    // === Scoring ===
    const hasGithub = !!process.env.GITHUB_TOKEN;
    const hasSocialData = !!process.env.SOCIALDATA_API_KEY;
    const weights = resolveWeights(hasGithub, hasSocialData);

    const tokenSkeletons: ScoredToken[] = tokensWithProfiles.map((t) => ({
      key: t.tokenAddress,
      tokenAddress: t.tokenAddress,
      symbol: t.symbol,
      name: t.name,
      pairAddress: t.pairAddress,
      chain,
      mentionCount: 0,
      uniqueAuthors: 0,
      engagementTotal: 0,
      githubCommits: 0,
      githubStarsDelta: 0,
      githubNewContributors: 0,
      githubReleases: 0,
      volume24h: t.volume24h ?? 0,
      liquidityUsd: t.liquidityUsd ?? 0,
      priceChange24h: t.priceChange24h ?? 0,
      priceUsd: t.priceUsd,
      devScore: 0,
      socialScore: 0,
      marketScore: 0,
      noveltyMultiplier: 1,
      qualityMultiplier: 1,
      totalScore: 0,
      topTweets: [],
      snippets: [],
    }));

    const scored = scoreTokens(tokenSkeletons, twitterResult.tweets, githubSignals, weights, chain);
    const topTokens = scored.slice(0, 10);

    if (topTokens.length === 0) {
      console.warn(`[AlphaDesk] No trending tokens found for ${chain}. Will generate ideas from narrative data only.`);
    } else if (topTokens.length < 3) {
      console.warn(`[AlphaDesk] Only ${topTokens.length} trending tokens for ${chain} — proceeding with narrative-driven generation.`);
    }

    // === LLM Generation ===
    const providerInfo = getLlmProviderInfo();
    context.llmProvider = providerInfo?.id;
    context.llmModel = providerInfo?.model;

    const allIdeas = await generateAlphaDeskIdeas({
      periodLabel,
      chain,
      tokens: topTokens,
      redditPosts,
      tweets: twitterResult.tweets,
      githubSignals,
    });

    const memeIdeas = allIdeas.filter((i) => i.ideaType === "meme_launch");
    const devIdeas = allIdeas.filter((i) => i.ideaType === "dev_build");

    // === Persistence ===
    await insertAlphaDeskIdeas(runId, allIdeas);

    await updateAlphaDeskRun(runId, {
      status: "succeeded",
      llmProvider: context.llmProvider,
      llmModel: context.llmModel,
      completedAt: new Date(),
      errorMessage: null,
    });

    console.log(`[AlphaDesk] Pipeline succeeded for ${chain}, runId=${runId}, memes=${memeIdeas.length}, dev=${devIdeas.length}`);
    return { runId, memeCount: memeIdeas.length, devCount: devIdeas.length };
  } catch (error: any) {
    console.error(`[AlphaDesk] Pipeline failed for ${chain}:`, error.message);
    await updateAlphaDeskRun(runId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: error.message,
    });
    throw error;
  }
}

function scoreTokens(
  tokens: ScoredToken[],
  tweets: import("./types").SocialDataTweet[],
  githubSignals: import("./types").GithubSignal[],
  weights: import("./score/weights").Weights,
  chain: Chain
): ScoredToken[] {
  if (tokens.length === 0) return [];

  // Compute baselines
  const avgVolume = tokens.reduce((s, t) => s + (t.volume24h ?? 0), 0) / tokens.length;
  const avgLiquidity = tokens.reduce((s, t) => s + (t.liquidityUsd ?? 0), 0) / tokens.length;

  const tweetByAuthor = new Map<string, import("./types").SocialDataTweet[]>();
  for (const t of tweets) {
    const arr = tweetByAuthor.get(t.author) ?? [];
    arr.push(t);
    tweetByAuthor.set(t.author, arr);
  }

  const scored: ScoredToken[] = tokens.map((token) => {
    const tokenTweets = tweets.filter((t) =>
      t.text.toLowerCase().includes(token.symbol.toLowerCase())
    );
    const mentionCount = tokenTweets.length;
    const uniqueAuthors = new Set(tokenTweets.map((t) => t.author)).size;
    const engagementTotal = tokenTweets.reduce(
      (s, t) => s + t.likes + t.retweets,
      0
    );

    const github = githubSignals.find((g) =>
      token.symbol.toLowerCase().includes(g.repo.split("/")[1]?.toLowerCase() ?? "")
    );

    const devScore =
      zScore(github?.commits ?? 0, 5) * 0.5 +
      zScore(github?.starsDelta ?? 0, 2) * 0.3 +
      zScore(github?.newContributors ?? 0, 1) * 0.2;

    const socialScore =
      zScore(mentionCount, 10) * 0.5 +
      zScore(uniqueAuthors, 5) * 0.3 +
      zScore(engagementTotal, 50) * 0.2;

    const marketScore =
      zScore(token.volume24h ?? 0, avgVolume) * 0.6 +
      zScore(token.liquidityUsd ?? 0, avgLiquidity) * 0.4;

    // Novelty bonus: assume newer tokens have less volume
    const daysOld = 0; // DexScreener doesn't give age easily; default to max bonus
    const noveltyMultiplier = computeNoveltyBonus(daysOld);

    const snippets = tokenTweets.map((t) => t.text);
    const qualityMultiplier = computeHypeOnlyPenalty(snippets);

    const totalScore =
      (devScore * weights.dev +
        socialScore * weights.social +
        marketScore * weights.market) *
      noveltyMultiplier *
      qualityMultiplier;

    return {
      ...token,
      mentionCount,
      uniqueAuthors,
      engagementTotal,
      githubCommits: github?.commits ?? 0,
      githubStarsDelta: github?.starsDelta ?? 0,
      githubNewContributors: github?.newContributors ?? 0,
      githubReleases: github?.releases ?? 0,
      devScore,
      socialScore,
      marketScore,
      noveltyMultiplier,
      qualityMultiplier,
      totalScore,
      topTweets: tokenTweets.slice(0, 3).map((t) => `@${t.author}: ${t.text.slice(0, 180)}`),
      snippets,
    };
  });

  return scored.sort((a, b) => b.totalScore - a.totalScore);
}
