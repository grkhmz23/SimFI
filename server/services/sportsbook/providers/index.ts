import { OddsApiIoProvider } from "./oddsApiIo";
import { TheOddsApiProvider } from "./theOddsApi";
import type { OddsProvider } from "./types";

export type { OddsProvider, NormalizedEvent, NormalizedOdds, NormalizedScore } from "./types";
export { OddsApiIoProvider } from "./oddsApiIo";
export { TheOddsApiProvider } from "./theOddsApi";

export function createOddsProvider(): OddsProvider {
  const primary = process.env.ODDS_PROVIDER_PRIMARY || "odds-api-io";

  if (primary === "odds-api-io") {
    return new OddsApiIoProvider();
  }
  if (primary === "the-odds-api") {
    return new TheOddsApiProvider();
  }

  // Fallback if primary value is unrecognized
  console.warn(`[sportsbook] Unrecognized ODDS_PROVIDER_PRIMARY="${primary}", defaulting to odds-api-io`);
  return new OddsApiIoProvider();
}
