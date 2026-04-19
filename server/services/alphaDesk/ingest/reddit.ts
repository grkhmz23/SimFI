// server/services/alphaDesk/ingest/reddit.ts
// Fetch hot posts from meme/crypto subreddits for narrative signal.

import type { RedditPost } from "../types";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "SimFi-AlphaDesk/1.0 (by /u/simfi-app)";

const SUBREDDITS = [
  "memecoins",
  "CryptoCurrency",
  "wallstreetbets",
  "SatoshiStreetBets",
  "CryptoMemes",
  "memeconomy",
];

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchSubredditHot(subreddit: string, limit = 15): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      console.warn(`[AlphaDesk] Reddit r/${subreddit} error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const posts: RedditPost[] = [];

    for (const child of data?.data?.children ?? []) {
      const p = child.data;
      if (!p || p.stickied) continue;
      posts.push({
        id: p.id,
        title: p.title,
        subreddit: p.subreddit,
        upvotes: p.ups ?? 0,
        commentCount: p.num_comments ?? 0,
        url: `https://www.reddit.com${p.permalink}`,
        createdAt: p.created_utc ? p.created_utc * 1000 : Date.now(),
      });
    }
    return posts;
  } catch (err) {
    console.warn(`[AlphaDesk] Reddit r/${subreddit} fetch failed:`, (err as Error).message);
    return [];
  }
}

export async function ingestRedditSignals(): Promise<RedditPost[]> {
  const allPosts: RedditPost[] = [];
  for (const sub of SUBREDDITS) {
    const posts = await fetchSubredditHot(sub, 12);
    allPosts.push(...posts);
    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  // Deduplicate by ID and sort by engagement (upvotes + comments)
  const seen = new Set<string>();
  const unique = allPosts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  unique.sort((a, b) => b.upvotes + b.commentCount - (a.upvotes + a.commentCount));
  return unique.slice(0, 30);
}
