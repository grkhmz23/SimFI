import type { Chain } from "@shared/schema";
import type { DexScreenerToken } from "../types";

const FETCH_TIMEOUT_MS = 15_000;

function chainToDexScreenerId(chain: Chain): string {
  return chain === "solana" ? "solana" : "base";
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": "SimFi-AlphaDesk/1.0" } });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchTrendingTokens(chain: Chain, limit = 50): Promise<DexScreenerToken[]> {
  const chainId = chainToDexScreenerId(chain);
  const url = `https://api.dexscreener.com/token-boosts/latest/v1`;

  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      console.warn(`[AlphaDesk] DexScreener boosts error: ${res.status}`);
      return [];
    }
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
  } catch (err) {
    console.warn("[AlphaDesk] DexScreener boosts fetch failed:", (err as Error).message);
    return [];
  }
}

export async function fetchTokenProfiles(tokens: DexScreenerToken[]): Promise<DexScreenerToken[]> {
  const enriched: DexScreenerToken[] = [];

  for (const token of tokens) {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`;
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (!res.ok) continue;
      const data = await res.json();
      const pair = data?.pairs?.[0];
      if (!pair) continue;

      enriched.push({
        ...token,
        priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : undefined,
        volume24h: pair.volume?.h24 ? parseFloat(pair.volume.h24) : undefined,
        liquidityUsd: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : undefined,
        priceChange24h: pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : undefined,
        pairAddress: pair.pairAddress,
      });

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // skip failed tokens
    }
  }

  return enriched;
}
