// server/services/alphaDesk/worker.ts
// Render worker entry point for Alpha Desk.
// Responsibilities:
//   1. On startup, check if today's run for each chain has completed. If not, trigger it.
//   2. Every 6 hours, measure outcomes (1h/6h/24h/7d price deltas) for ideas from the last 7 days.

import { runDailyPipeline } from "./index";
import { getUnmeasuredIdeas, recordOutcome } from "./persist/outcomes";
import { fetchTokenProfiles } from "./ingest/dexscreener";

const CHAINS: Array<"base" | "solana" | "any"> = ["any"];
const OUTCOME_HORIZONS: Array<"1h" | "6h" | "24h" | "7d"> = ["1h", "6h", "24h", "7d"];

function detectChainFromAddress(address: string): "solana" | "base" {
  // EVM addresses start with 0x followed by 40 hex chars
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "base";
  // Solana addresses are base58 encoded, 32-44 chars
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  // Default to solana for ambiguous cases
  return "solana";
}

async function ensureTodayRuns(): Promise<void> {
  for (const chain of CHAINS) {
    try {
      await runDailyPipeline(chain);
    } catch (err) {
      console.error(`[AlphaDesk Worker] Failed to ensure run for ${chain}:`, (err as Error).message);
    }
  }
}

async function measureOutcomes(): Promise<void> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const chain of CHAINS) {
    for (const horizon of OUTCOME_HORIZONS) {
      try {
        const ideas = await getUnmeasuredIdeas(chain, since, horizon);
        if (ideas.length === 0) continue;

        // Batch fetch current prices via DexScreener
        const tokens = ideas.map((i) => ({
          tokenAddress: i.tokenAddress,
          chainId: detectChainFromAddress(i.tokenAddress),
          symbol: "",
          name: "",
        }));
        const profiles = await fetchTokenProfiles(tokens);
        const priceMap = new Map(profiles.map((p) => [p.tokenAddress, p.priceUsd]));

        let recorded = 0;
        for (const idea of ideas) {
          const currentPrice = priceMap.get(idea.tokenAddress);
          const publishPrice = idea.priceAtPublishUsd ? parseFloat(idea.priceAtPublishUsd) : undefined;

          if (currentPrice != null && publishPrice != null && publishPrice > 0) {
            const pctChange = ((currentPrice - publishPrice) / publishPrice) * 100;
            await recordOutcome({
              ideaId: idea.id,
              horizon,
              priceUsd: currentPrice,
              pctChange,
            });
            recorded++;
          }
        }
        if (recorded > 0) {
          console.log(`[AlphaDesk Worker] Recorded ${recorded} outcomes for ${chain}/${horizon}`);
        }
      } catch (err) {
        console.error(`[AlphaDesk Worker] Outcome measurement failed for ${chain}/${horizon}:`, (err as Error).message);
      }
    }
  }
}

export async function startWorker(): Promise<void> {
  console.log("[AlphaDesk Worker] Starting...");

  // Ensure today's runs on startup
  await ensureTodayRuns();

  // Re-check for today's runs every 2 hours (handles servers that stay up across midnight)
  setInterval(ensureTodayRuns, 2 * 60 * 60 * 1000);

  // Schedule outcome measurement every 6 hours
  setInterval(measureOutcomes, 6 * 60 * 60 * 1000);

  // Also run outcomes immediately
  await measureOutcomes();

  console.log("[AlphaDesk Worker] Running. Run check every 2h, outcome measurement every 6h.");
}

// If this file is executed directly (e.g., via tsx server/services/alphaDesk/worker.ts)
// Use argv check instead of import.meta.url to avoid firing when bundled into dist/index.js
if (process.argv[1]?.endsWith("worker.ts") || process.argv[1]?.endsWith("worker.js")) {
  startWorker().catch((err) => {
    console.error("[AlphaDesk Worker] Fatal error:", err);
    process.exit(1);
  });
}
