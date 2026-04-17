import type { Chain } from "@shared/schema";

// Known Base smart money / whale wallets for demo
const BASE_WHALE_WALLETS = [
  { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", alias: "Base God" },
  { address: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", alias: "Smart Money #1" },
  { address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", alias: "Whale #2" },
  { address: "0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0", alias: "Degen Trader" },
  { address: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", alias: "Binance Hot" },
];

export interface WhaleActivity {
  id: string;
  walletAddress: string;
  walletAlias: string;
  tokenAddress: string;
  tokenSymbol: string;
  action: 'buy' | 'sell';
  amountNative: number;
  timestamp: string;
  chain: Chain;
  txHash?: string;
}

// In-memory cache
let cachedActivities: WhaleActivity[] = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function fetchBirdeyeTokenTrades(tokenAddress: string, chain: Chain): Promise<any[]> {
  try {
    const response = await fetch(
      `https://public-api.birdeye.so/defi/txs/token?address=${tokenAddress}&offset=0&limit=20`,
      {
        headers: {
          'accept': 'application/json',
          'x-chain': chain,
        },
      }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.data?.items || [];
  } catch {
    return [];
  }
}

async function fetchDexScreenerTokenProfiles(): Promise<any[]> {
  try {
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    if (!response.ok) return [];
    const data = await response.json();
    return data || [];
  } catch {
    return [];
  }
}

export const whaleFeed = {
  async getActivity(chain: Chain = 'base'): Promise<WhaleActivity[]> {
    const now = Date.now();
    if (now - lastFetchTime < CACHE_TTL_MS && cachedActivities.length > 0) {
      return cachedActivities.filter(a => a.chain === chain);
    }

    const activities: WhaleActivity[] = [];

    // For demo purposes, generate realistic mock activity based on trending tokens
    // In production this would call Birdeye/BaseScan APIs for each whale wallet
    try {
      const profiles = await fetchDexScreenerTokenProfiles();
      const baseProfiles = profiles.filter((p: any) => p.chainId === 'base').slice(0, 10);

      for (const wallet of BASE_WHALE_WALLETS) {
        // Pick 1-3 random tokens
        const numTrades = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numTrades; i++) {
          const token = baseProfiles[Math.floor(Math.random() * baseProfiles.length)];
          if (!token) continue;
          const action = Math.random() > 0.5 ? 'buy' : 'sell';
          const minutesAgo = Math.floor(Math.random() * 120);
          const timestamp = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

          activities.push({
            id: `${wallet.address}-${token.tokenAddress}-${timestamp}`,
            walletAddress: wallet.address,
            walletAlias: wallet.alias,
            tokenAddress: token.tokenAddress,
            tokenSymbol: token.description?.split(' ')[0]?.replace('$', '') || 'TOKEN',
            action,
            amountNative: parseFloat((Math.random() * 5).toFixed(4)),
            timestamp,
            chain,
          });
        }
      }
    } catch (error) {
      console.error('Whale feed fetch error:', error);
    }

    // Sort by timestamp desc
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    cachedActivities = activities;
    lastFetchTime = now;

    return activities;
  }
};
