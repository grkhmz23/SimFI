import type { OddsProvider, NormalizedEvent, NormalizedOdds, NormalizedScore } from "./types";

const BOOKMAKER_PRIORITY = [
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us",
  "pinnacle",
];

function getBaseUrl(): string {
  return process.env.THE_ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4";
}

function getApiKey(): string {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) throw new Error("THE_ODDS_API_KEY is not set");
  return key;
}

function pickBookmaker(bookmakers: any[]): { key: string; market: any } | null {
  for (const preferred of BOOKMAKER_PRIORITY) {
    const bm = bookmakers.find(
      (b) => b.key?.toLowerCase() === preferred.toLowerCase()
    );
    if (bm) {
      const market = bm.markets?.find((m: any) => m.key === "h2h");
      if (market) return { key: bm.key, market };
    }
  }
  // Fallback: first bookmaker with h2h market
  for (const bm of bookmakers) {
    const market = bm.markets?.find((m: any) => m.key === "h2h");
    if (market) return { key: bm.key, market };
  }
  return null;
}

function mapOutcomeToOdds(
  outcomes: any[],
  homeTeam: string,
  awayTeam: string
): { homeOdds: number; awayOdds: number; drawOdds: number | null } {
  let homeOdds = 0;
  let awayOdds = 0;
  let drawOdds: number | null = null;

  for (const outcome of outcomes) {
    const name = outcome.name;
    const price = Number(outcome.price);
    if (name === homeTeam) homeOdds = price;
    else if (name === awayTeam) awayOdds = price;
    else if (name?.toLowerCase() === "draw") drawOdds = price;
  }

  return { homeOdds, awayOdds, drawOdds };
}

export class TheOddsApiProvider implements OddsProvider {
  name = "the-odds-api";

  async fetchEventsWithOdds(league: string): Promise<{
    events: NormalizedEvent[];
    odds: NormalizedOdds[];
  }> {
    const url = `${getBaseUrl()}/sports/${encodeURIComponent(league)}/odds?apiKey=${getApiKey()}&regions=us&markets=h2h&oddsFormat=decimal`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`The Odds API /odds failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const fetchedAt = new Date();

    const events: NormalizedEvent[] = [];
    const odds: NormalizedOdds[] = [];

    for (const item of data) {
      const externalId = String(item.id);
      const homeTeam = String(item.home_team || "");
      const awayTeam = String(item.away_team || "");
      const commenceTime = new Date(item.commence_time);

      events.push({
        externalId,
        league,
        homeTeam,
        awayTeam,
        commenceTime,
      });

      const picked = pickBookmaker(item.bookmakers || []);
      if (!picked) continue;

      const { homeOdds, awayOdds, drawOdds } = mapOutcomeToOdds(
        picked.market.outcomes || [],
        homeTeam,
        awayTeam
      );

      if (homeOdds > 0 && awayOdds > 0) {
        odds.push({
          externalEventId: externalId,
          marketType: "h2h",
          bookmakerKey: picked.key,
          homeOdds,
          awayOdds,
          drawOdds,
          fetchedAt,
        });
      }
    }

    return { events, odds };
  }

  async fetchScores(league: string, daysFrom: number): Promise<NormalizedScore[]> {
    const url = `${getBaseUrl()}/sports/${encodeURIComponent(league)}/scores?apiKey=${getApiKey()}&daysFrom=${daysFrom}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`The Odds API /scores failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const now = new Date();

    const scores: NormalizedScore[] = [];
    for (const item of data) {
      const externalEventId = String(item.id);
      const commenceTime = new Date(item.commence_time);
      const completed = item.completed === true;
      const scoresArr = item.scores;

      let status: NormalizedScore["status"] = "scheduled";
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      let completedAt: Date | null = null;

      if (completed) {
        status = "completed";
        completedAt = now;
      } else if (commenceTime <= now) {
        status = "live";
      }

      if (Array.isArray(scoresArr)) {
        for (const s of scoresArr) {
          const scoreNum = s.score != null ? Number(s.score) : null;
          if (s.name === item.home_team && scoreNum != null) homeScore = scoreNum;
          if (s.name === item.away_team && scoreNum != null) awayScore = scoreNum;
        }
      }

      scores.push({
        externalEventId,
        status,
        homeScore,
        awayScore,
        completedAt,
        raw: item,
      });
    }

    return scores;
  }
}
