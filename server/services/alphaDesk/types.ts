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

export interface AlphaDeskIdeaGenerated {
  rank: number;
  narrativeTitle: string;
  tokenName: string;
  ticker: string;
  thesis: string;
  whyNow: string;
  twitterEvidence: string[];
  riskFlags: string[];
  confidence: number;
  chain: Chain;
  tokenAddress: string;
  category: "utility" | "meme";
  riskLevel: "low" | "medium" | "high";
}

export interface AlphaDeskIdeaInput {
  periodLabel: string;
  tokens: ScoredToken[];
  worldNews?: string[];
}

// =============================================================================
// Pipeline result types
// =============================================================================

export interface AlphaDeskRunResult {
  runId: number;
  runDate: string;
  chain: Chain;
  ideaCount: number;
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
