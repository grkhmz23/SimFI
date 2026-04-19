import type { Chain } from "@shared/schema";

// =============================================================================
// Ingestion types
// =============================================================================

export interface DexScreenerToken {
  tokenAddress: string;
  chainId: string;
  symbol: string;
  name: string;
  priceUsd?: number;
  volume24h?: number;
  liquidityUsd?: number;
  priceChange24h?: number;
  pairAddress?: string;
}

export interface SocialDataTweet {
  id: string;
  text: string;
  createdAt: string;
  author: string;
  followers: number;
  likes: number;
  retweets: number;
}

export interface GithubSignal {
  repo: string;
  commits: number;
  starsDelta: number;
  newContributors: number;
  releases: number;
}

export interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  upvotes: number;
  commentCount: number;
  url: string;
  createdAt: number;
}

export interface MarketSignal {
  trend: string;
  sentiment: "bullish" | "bearish" | "neutral";
  volumeChange24h?: number;
  liquidityChange24h?: number;
}

// =============================================================================
// Scoring types
// =============================================================================

export interface ScoredToken {
  key: string;
  tokenAddress: string;
  symbol: string;
  name: string;
  pairAddress?: string;
  chain: Chain;

  // Raw signals
  mentionCount: number;
  uniqueAuthors: number;
  engagementTotal: number;
  githubCommits: number;
  githubStarsDelta: number;
  githubNewContributors: number;
  githubReleases: number;
  volume24h: number;
  liquidityUsd: number;
  priceChange24h: number;
  priceUsd?: number;

  // Computed scores
  devScore: number;
  socialScore: number;
  marketScore: number;
  noveltyMultiplier: number;
  qualityMultiplier: number;
  totalScore: number;

  // Evidence
  topTweets: string[];
  snippets: string[];
}

// =============================================================================
// LLM types
// =============================================================================

export interface MemeLaunchIdeaGenerated {
  ideaType: "meme_launch";
  rank: number;
  title: string;
  tokenName: string;
  ticker: string;
  thesis: string;
  whyNow: string;
  memeTheme: string;
  redditInspiration: string[];
  twitterNarrative: string;
  marketSignal: string;
  riskFlags: string[];
  confidence: number;
  chain: Chain;
  category: "meme" | "culture" | "political" | "tech";
  riskLevel: "low" | "medium" | "high";
}

export interface DevBuildIdeaGenerated {
  ideaType: "dev_build";
  rank: number;
  title: string;
  projectName: string;
  concept: string;
  whyNow: string;
  targetAudience: string;
  suggestedStack: string[];
  complexity: "weekend" | "sprint" | "quarter";
  monetization: string;
  chain: Chain;
  confidence: number;
  evidence: string[];
}

export type AlphaDeskIdeaGenerated = MemeLaunchIdeaGenerated | DevBuildIdeaGenerated;

export interface AlphaDeskIdeaInput {
  periodLabel: string;
  tokens: ScoredToken[];
  redditPosts: RedditPost[];
  tweets: SocialDataTweet[];
  githubSignals: GithubSignal[];
  worldNews?: string[];
}

// =============================================================================
// Pipeline result types
// =============================================================================

export interface AlphaDeskRunResult {
  runId: number;
  runDate: string;
  chain: Chain;
  memeCount: number;
  devCount: number;
  status: "pending" | "succeeded" | "failed";
}

export interface PipelineContext {
  chain: Chain;
  runDate: string;
  sourcesUsed: Record<string, boolean>;
  llmProvider?: string;
  llmModel?: string;
  errorMessage?: string;
}
