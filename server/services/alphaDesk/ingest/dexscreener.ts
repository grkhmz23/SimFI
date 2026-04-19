import type { Chain } from "@shared/schema";
import type { DexScreenerToken } from "../types";
import { ingestFetch } from "./client";

const API_NAME = "dexscreener";

function chainToDexScreenerId(chain: Chain): string {
  return chain === "solana" ? "solana" : "base";
}

export async function fetchTrendingTokens(chain: Chain, limit = 50): Promise<DexScreenerToken[]> {
  const chainId = chainToDexScreenerId(chain);
  const res = await ingestFetch({
    apiName: API_NAME,
    url: "https://api.dexscreener.com/token-boosts/latest/v1",
    timeoutMs: 15_000,
    retries: 2,
    retryDelayMs: 1_500,
  });

  if (!res) return [];

  try {
    const data = await res.json();
    const tokens: DexScreenerToken[] = [];
    for (const item of data ?? []) {
      if (item.chainId !== chainId) continue;
      tokens.push({
        tokenAddress: item.tokenAddress,
        chainId: item.chainId,
        symbol: item.symbol || "UNKNOWN",
        name: item.name || item.symbol || "Unknown",
      });
      if (tokens.length >= limit) break;
    }
    return tokens;
  } catch {
    return [];
  }
}

export async function fetchTokenProfiles(tokens: DexScreenerToken[]): Promise<DexScreenerToken[]> {
  const enriched: DexScreenerToken[] = [];

  for (const token of tokens) {
    const res = await ingestFetch({
      apiName: API_NAME,
      url: `https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`,
      timeoutMs: 10_000,
      retries: 1,
      retryDelayMs: 1_000,
    });

    if (!res) {
      // Circuit breaker or failure — skip but keep original token
      enriched.push(token);
      continue;
    }

    try {
      const data = await res.json();
      const pair = data?.pairs?.[0];
      if (!pair) {
        enriched.push(token);
        continue;
      }

      enriched.push({
        ...token,
        priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : undefined,
        volume24h: pair.volume?.h24 ? parseFloat(pair.volume.h24) : undefined,
        liquidityUsd: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : undefined,
        priceChange24h: pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : undefined,
        pairAddress: pair.pairAddress,
      });
    } catch {
      enriched.push(token);
    }

    // Rate limit breathing room
    await new Promise((r) => setTimeout(r, 200));
  }

  return enriched;
}
