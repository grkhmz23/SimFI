// server/services/alphaDesk/llm/prompts.ts
// Prompts for dual-mode Alpha Desk: meme launch ideas + dev build ideas.

import type { AlphaDeskChain } from "../types";
import type { ScoredToken, RedditPost, SocialDataTweet, GithubSignal } from "../types";

function formatTokens(tokens: ScoredToken[]): string {
  return tokens
    .map((t, i) => {
      return `${i + 1}. ${t.symbol} (${t.name}) — Vol $${(t.volume24h ?? 0).toFixed(0)}, MC signal: ${t.priceChange24h?.toFixed(1) ?? 0}%\n   Social: ${t.mentionCount} mentions, ${t.uniqueAuthors} authors, ${t.engagementTotal} engagement\n   Dev: ${t.githubCommits} commits, ${t.githubStarsDelta} stars`;
    })
    .join("\n\n");
}

function formatReddit(posts: RedditPost[]): string {
  return posts
    .slice(0, 15)
    .map((p, i) => `${i + 1}. [${p.subreddit}] ${p.title} (↑${p.upvotes}, ${p.commentCount} comments)`)
    .join("\n");
}

function formatTweets(tweets: SocialDataTweet[]): string {
  return tweets
    .slice(0, 10)
    .map((t, i) => `${i + 1}. @${t.author}: ${t.text.slice(0, 140)}${t.text.length > 140 ? "..." : ""} (${t.likes}♥ ${t.retweets}↻)`)
    .join("\n");
}

function formatGithub(signals: GithubSignal[]): string {
  return signals
    .map((g) => `- ${g.repo}: ${g.commits} commits, +${g.starsDelta} stars, ${g.newContributors} new contributors, ${g.releases} releases`)
    .join("\n");
}

// ============================================================================
// MEME LAUNCH IDEAS PROMPT
// ============================================================================

export function buildMemeLaunchSystemPrompt(): string {
  return `You are SimFi Alpha Desk — a viral meme token concept generator for blockchain creators.

Your job: analyze social signals, Reddit humor, Twitter narratives, big news, and market trends to generate 3-5 high-conviction MEME TOKEN LAUNCH IDEAS per chain.

These are NOT investment picks. They are CREATIVE CONCEPTS for tokens that creators could launch today.

CRITICAL RULES:
- The BEST meme tokens come from OUTSIDE crypto. A politician saying a funny word, a viral video, a celebrity moment, a tech fail, a sports moment — ANYTHING that makes people laugh or feel FOMO can become a token.
- Examples of real viral token origins: Trump saying "covfefe" → $COVFEFE token. A cat video going viral → $CAT token. A tech CEO embarrassing themselves → token. A misspelled tweet → token.
- Each idea must be rooted in CURRENT internet culture, Reddit humor, Twitter narratives, OR BREAKING NEWS.
- Ticker symbols should be memorable, funny, and ≤6 characters.
- Themes can be: politics, sports, tech fails, celebrity moments, viral videos, food trends, animal memes, absurd internet moments, or anything currently trending.
- Explain WHY this concept would resonate NOW (timeliness is everything).
- Include the EXACT Reddit post title, news headline, or Twitter trend that inspired it.
- Risk flags should be honest (regulatory, saturation, short-lived trend, trademark issues).
- Confidence scores should reflect how strong the cultural signal is (0-100).

Output STRICT JSON. No markdown, no explanations outside JSON.`;
}

export function buildMemeLaunchUserPrompt(
  periodLabel: string,
  chain: AlphaDeskChain,
  tokens: ScoredToken[],
  redditPosts: RedditPost[],
  tweets: SocialDataTweet[],
  githubSignals: GithubSignal[]
): string {
  const chainLabel = chain === "any" ? "the Solana and Base ecosystems" : `the ${chain.toUpperCase()} blockchain`;
  return `Generate 3-5 viral meme token LAUNCH CONCEPTS for ${chainLabel}.

Period: ${periodLabel}

IMPORTANT: The Reddit posts below include GENERAL NEWS, POLITICS, FUNNY POSTS, and MEMES — not just crypto. The BEST token ideas often come from random viral moments, funny news headlines, political gaffes, celebrity slip-ups, or trending memes that have NOTHING to do with cryptocurrency.

Think like this:
- "Trump mispronounces a word at a rally" → $THATWORD token
- "A cat video gets 10M views in 2 hours" → $CAT token
- "A tech CEO accidentally live-streams themselves" → $OOPS token
- "A misspelled tweet goes viral" → $SPELL token
- "A politician wears something absurd" → $FIT token
- "A scientific discovery with a funny name" → $NAME token

--- TOP ON-CHAIN TOKENS (market signal) ---
${formatTokens(tokens.slice(0, 8))}

--- REDDIT HOT POSTS (culture & news signal) ---
${formatReddit(redditPosts)}

--- TWITTER SNIPPETS (narrative signal) ---
${formatTweets(tweets)}

--- GITHUB ACTIVITY (dev signal) ---
${formatGithub(githubSignals)}

Now generate 3-5 meme token launch concepts. Each must include:
- title: catchy headline for the concept
- token_name: full name of the token
- ticker: short symbol (2-6 chars)
- thesis: why this meme works culturally
- why_now: what current event/trend makes this timely
- meme_theme: the core joke or cultural reference
- reddit_inspiration: array of Reddit post titles or news headlines that inspired this
- twitter_narrative: the Twitter angle or hashtag
- market_signal: what on-chain trend supports this (or "N/A" if purely cultural)
- risk_flags: array of honest risks
- confidence: 0-100 score
- category: one of [meme, culture, political, tech]
- risk_level: one of [low, medium, high]

Respond with JSON in this exact shape:
{
  "ideas": [
    {
      "title": "...",
      "token_name": "...",
      "ticker": "...",
      "thesis": "...",
      "why_now": "...",
      "meme_theme": "...",
      "reddit_inspiration": ["..."],
      "twitter_narrative": "...",
      "market_signal": "...",
      "risk_flags": ["..."],
      "confidence": 85,
      "category": "meme",
      "risk_level": "medium"
    }
  ]
}`;
}

// ============================================================================
// DEV BUILD IDEAS PROMPT
// ============================================================================

export function buildDevBuildSystemPrompt(): string {
  return `You are SimFi Alpha Desk — a product ideation engine for blockchain developers.

Your job: analyze market gaps, social narratives, GitHub activity, and on-chain trends to generate 3-5 PROJECT IDEAS that developers could build on Base or Solana.

These are NOT token picks. They are PRODUCT/PROTOCOL CONCEPTS for builders.

Rules:
- Each idea must solve a real problem or capture a real narrative gap.
- Include suggested tech stack (smart contract language, frontend, indexing, etc.).
- Complexity levels: weekend (1-3 days), sprint (1-2 weeks), quarter (1-3 months).
- Explain monetization or sustainability model.
- Target audience should be specific (DeFi traders, NFT creators, memecoin launchers, etc.).
- Use evidence from GitHub repos, Twitter complaints/requests, and market data.
- Confidence scores reflect market demand signal strength (0-100).

Output STRICT JSON. No markdown, no explanations outside JSON.`;
}

export function buildDevBuildUserPrompt(
  periodLabel: string,
  chain: AlphaDeskChain,
  tokens: ScoredToken[],
  redditPosts: RedditPost[],
  tweets: SocialDataTweet[],
  githubSignals: GithubSignal[]
): string {
  const chainLabel = chain === "any" ? "the Solana and Base ecosystems" : `the ${chain.toUpperCase()} ecosystem`;
  return `Generate 3-5 developer BUILD IDEAS for ${chainLabel}.

Period: ${periodLabel}

--- TOP ON-CHAIN TOKENS (market signal) ---
${formatTokens(tokens.slice(0, 8))}

--- REDDIT HOT POSTS (pain points / requests) ---
${formatReddit(redditPosts)}

--- TWITTER SNIPPETS (developer sentiment) ---
${formatTweets(tweets)}

--- GITHUB ACTIVITY (what devs are building) ---
${formatGithub(githubSignals)}

Now generate 3-5 build ideas for developers. Each must include:
- title: catchy product headline
- project_name: name of the concept
- concept: what it does and why it matters
- why_now: what market gap or narrative makes this timely
- target_audience: who would use this
- suggested_stack: array of technologies (e.g., ["Solidity", "Next.js", "Ponder"])
- complexity: one of [weekend, sprint, quarter]
- monetization: how it makes money or sustains itself
- evidence: array of specific tweets, Reddit posts, or market signals that support this idea
- risk_flags: array of honest risks (technical, regulatory, competition, etc.)
- risk_level: one of [low, medium, high]
- confidence: 0-100 score

Respond with JSON in this exact shape:
{
  "ideas": [
    {
      "title": "...",
      "project_name": "...",
      "concept": "...",
      "why_now": "...",
      "target_audience": "...",
      "suggested_stack": ["..."],
      "complexity": "sprint",
      "monetization": "...",
      "evidence": ["..."],
      "confidence": 82
    }
  ]
}`;
}
