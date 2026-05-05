import { createOddsProvider } from "./index";

async function main() {
  const provider = createOddsProvider();
  console.log(`Smoke test: provider=${provider.name}`);

  const leagues = ["basketball_nba", "americanfootball_nfl", "soccer_epl", "soccer_uefa_champs_league"];

  for (const league of leagues) {
    try {
      const { events, odds } = await provider.fetchEventsWithOdds(league);
      console.log(`\n[${league}] events=${events.length}, odds=${odds.length}`);

      if (events.length > 0) {
        for (let i = 0; i < Math.min(3, events.length); i++) {
          const ev = events[i];
          const evOdds = odds.find((o) => o.externalEventId === ev.externalId);
          console.log(
            `  ${ev.homeTeam} vs ${ev.awayTeam} @ ${ev.commenceTime.toISOString()}` +
            (evOdds
              ? ` | odds: ${evOdds.homeOdds} / ${evOdds.awayOdds}${evOdds.drawOdds != null ? ` / ${evOdds.drawOdds}` : ""} (${evOdds.bookmakerKey})`
              : " | (no odds)")
          );
        }
      } else {
        console.log(`  No events found (may be off-season)`);
      }
    } catch (err: any) {
      console.error(`[${league}] ERROR: ${err.message}`);
    }
  }

  // Also test scores for one league
  try {
    const scores = await provider.fetchScores("basketball_nba", 3);
    console.log(`\n[scores basketball_nba] count=${scores.length}`);
    for (let i = 0; i < Math.min(3, scores.length); i++) {
      const s = scores[i];
      console.log(
        `  ${s.externalEventId} status=${s.status} home=${s.homeScore} away=${s.awayScore}`
      );
    }
  } catch (err: any) {
    console.error(`[scores basketball_nba] ERROR: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
