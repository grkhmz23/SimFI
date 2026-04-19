// server/services/alphaDesk/worker.ts
// Render worker entry point for Alpha Desk.
// Responsibilities:
//   1. On startup, check if today's run for each chain has completed. If not, trigger it.
//   2. Every 6 hours, measure outcomes (1h/6h/24h/7d price deltas) for ideas from the last 7 days.

import { runDailyPipeline } from "./index";
import { getUnmeasuredIdeas, recordOutcome } from "./persist/outcomes";
import { fetchTokenProfiles } from "./ingest/dexscreener";

const CHAINS: Array<"base" | "solana"> = ["base", "solana"];
const OUTCOME_HORIZONS: Array<"1h" | "6h" | "24h" | "7d"> = ["1h", "6h", "24h", "7d"];

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
          chainId: chain === "solana" ? "solana" : "base",
          symbol: "",
          name: "",
        }));
        const profiles = await fetchTokenProfiles(tokens);
        const priceMap = new Map(profiles.map((p) => [p.tokenAddress, p.priceUsd]));

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
          }
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

  // Schedule outcome measurement every 6 hours
  setInterval(measureOutcomes, 6 * 60 * 60 * 1000);

  // Also run outcomes immediately
  await measureOutcomes();

  console.log("[AlphaDesk Worker] Running. Outcome measurement scheduled every 6h.");
}

// If this file is executed directly (e.g., via tsx server/services/alphaDesk/worker.ts)
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker().catch((err) => {
    console.error("[AlphaDesk Worker] Fatal error:", err);
    process.exit(1);
  });
}
