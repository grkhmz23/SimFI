import type { Chain } from "@shared/schema";
import type { SocialDataTweet } from "../types";

const API_BASE = "https://api.socialdata.tools/twitter/search";
const FETCH_TIMEOUT_MS = 15_000;
const REQUEST_DELAY_MS = 500;

function buildQuery(chain: Chain, since: string, until: string): string {
  const chainTerms = chain === "solana" ? "solana OR $SOL OR memecoin" : "base OR $BASE OR memecoin";
  const query = `${chainTerms} since:${since} until:${until}`;
  return encodeURIComponent(query);
}

async function fetchWithTimeout(url: string, timeoutMs: number, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function ingestTwitterSignals(
  chain: Chain,
  since: string,
  until: string
): Promise<{ tweets: SocialDataTweet[]; totalMentions: number; uniqueAuthors: number }> {
  const apiKey = process.env.SOCIALDATA_API_KEY;
  if (!apiKey) {
    console.log("[AlphaDesk] SOCIALDATA_API_KEY not set, skipping Twitter ingestion");
    return { tweets: [], totalMentions: 0, uniqueAuthors: 0 };
  }

  const url = `${API_BASE}?query=${buildQuery(chain, since, until)}&type=Latest`;

  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, apiKey);
    if (!res.ok) {
      console.warn(`[AlphaDesk] SocialData error: ${res.status}`);
      return { tweets: [], totalMentions: 0, uniqueAuthors: 0 };
    }

    const data = await res.json();
    const rawTweets = data?.tweets ?? [];
    const tweets: SocialDataTweet[] = rawTweets.map((t: any) => ({
      id: t.id_str ?? t.id ?? "",
      text: t.full_text ?? t.text ?? "",
      createdAt: t.tweet_created_at ?? t.created_at ?? "",
      author: t.user?.screen_name ?? t.user?.username ?? "",
      followers: t.user?.followers_count ?? 0,
      likes: t.favorite_count ?? t.like_count ?? 0,
      retweets: t.retweet_count ?? 0,
    }));

    const authors = new Set(tweets.map((t) => t.author));
    return {
      tweets,
      totalMentions: tweets.length,
      uniqueAuthors: authors.size,
    };
  } catch (err) {
    console.warn("[AlphaDesk] SocialData fetch failed:", (err as Error).message);
    return { tweets: [], totalMentions: 0, uniqueAuthors: 0 };
  }
}
