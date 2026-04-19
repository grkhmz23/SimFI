import type { RedditPost } from "../types";
import { ingestFetch } from "./client";

const API_NAME = "reddit";

const SUBREDDITS = [
  // Crypto & trading
  "memecoins",
  "CryptoCurrency",
  "wallstreetbets",
  "SatoshiStreetBets",
  "CryptoMemes",
  "memeconomy",
  // General news & politics (big news → instant tokens)
  "news",
  "worldnews",
  "politics",
  "nottheonion",
  // Funny & viral (meme fuel)
  "funny",
  "memes",
  "dankmemes",
  "shitposting",
  "WhitePeopleTwitter",
  "BlackPeopleTwitter",
  // Tech & culture
  "technology",
  "gadgets",
  "OutOfTheLoop",
  "subredditdrama",
];

async function fetchSubredditHot(subreddit: string, limit = 12): Promise<RedditPost[]> {
  const res = await ingestFetch({
    apiName: API_NAME,
    url: `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`,
    timeoutMs: 15_000,
    retries: 1,
    retryDelayMs: 2_000,
  });

  if (!res) return [];

  try {
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
  } catch {
    return [];
  }
}

export async function ingestRedditSignals(): Promise<RedditPost[]> {
  const allPosts: RedditPost[] = [];

  for (const sub of SUBREDDITS) {
    const posts = await fetchSubredditHot(sub, 10);
    allPosts.push(...posts);
    // Reddit is strict — longer delay between subs
    await new Promise((r) => setTimeout(r, 500));
  }

  // Deduplicate by ID and sort by engagement
  const seen = new Set<string>();
  const unique = allPosts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  unique.sort((a, b) => b.upvotes + b.commentCount - (a.upvotes + a.commentCount));
  return unique.slice(0, 30);
}
