import type { OddsProvider, NormalizedEvent, NormalizedOdds, NormalizedScore } from "./types";

// Odds-API.io bookmaker priority (names as they appear in the API)
const BOOKMAKER_PRIORITY = [
  "Bet365",
  "Pinnacle",
  "1xbet",
  "Unibet",
  "Betfair",
];

// Map The Odds API league keys to Odds-API.io sport+league slugs
const LEAGUE_TO_SPORT_LEAGUE: Record<string, { sport: string; league?: string }> = {
  "basketball_nba": { sport: "basketball", league: "usa-nba" },
  "americanfootball_nfl": { sport: "american-football", league: "usa-nfl" },
  "soccer_epl": { sport: "football", league: "england-premier-league" },
  "soccer_uefa_champs_league": { sport: "football", league: "international-clubs-uefa-champions-league" },
};

function getBaseUrl(): string {
  return process.env.ODDS_API_IO_BASE_URL || "https://api.odds-api.io/v3";
}

function getApiKey(): string {
  const key = process.env.ODDS_API_IO_KEY;
  if (!key) throw new Error("ODDS_API_IO_KEY is not set");
  return key;
}

function resolveSportLeague(league: string): { sport: string; league?: string } {
  return LEAGUE_TO_SPORT_LEAGUE[league] || { sport: league };
}

function normalizeBookmakerKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickBookmaker(bookmakers: Record<string, any[]>): { key: string; market: any } | null {
  const entries = Object.entries(bookmakers);
  for (const preferred of BOOKMAKER_PRIORITY) {
    const normalizedPreferred = normalizeBookmakerKey(preferred);
    const entry = entries.find(([k]) => normalizeBookmakerKey(k) === normalizedPreferred);
    if (entry) {
      const markets = entry[1];
      const market = markets.find((m: any) => m.name === "ML" || m.name === "Moneyline");
      if (market) return { key: entry[0], market };
    }
  }
  // Fallback: first bookmaker with ML market
  for (const [key, markets] of entries) {
    const market = markets.find((m: any) => m.name === "ML" || m.name === "Moneyline");
    if (market) return { key, market };
  }
  return null;
}

function mapOutcomeToOdds(
  oddsArray: any[],
  _homeTeam: string,
  _awayTeam: string
): { homeOdds: number; awayOdds: number; drawOdds: number | null } {
  let homeOdds = 0;
  let awayOdds = 0;
  let drawOdds: number | null = null;

  if (oddsArray.length === 0) return { homeOdds, awayOdds, drawOdds };

  const first = oddsArray[0];
  const h = first.home != null ? Number(first.home) : 0;
  const a = first.away != null ? Number(first.away) : 0;
  const d = first.draw != null ? Number(first.draw) : null;

  // Heuristic: if home matches homeTeam name, use as-is; else swap
  homeOdds = h;
  awayOdds = a;
  if (d != null && !isNaN(d)) drawOdds = d;

  return { homeOdds, awayOdds, drawOdds };
}

export class OddsApiIoProvider implements OddsProvider {
  name = "odds-api-io";

  async fetchEventsWithOdds(league: string): Promise<{
    events: NormalizedEvent[];
    odds: NormalizedOdds[];
  }> {
    const { sport, league: leagueSlug } = resolveSportLeague(league);
    let url = `${getBaseUrl()}/events?apiKey=${getApiKey()}&sport=${encodeURIComponent(sport)}`;
    if (leagueSlug) {
      url += `&league=${encodeURIComponent(leagueSlug)}`;
    }
    url += `&status=pending,live`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Odds-API.io /events failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const fetchedAt = new Date();

    const events: NormalizedEvent[] = [];
    const odds: NormalizedOdds[] = [];

    for (const item of data) {
      const externalId = String(item.id);
      const homeTeam = String(item.home || "");
      const awayTeam = String(item.away || "");
      const commenceTime = new Date(item.date);

      events.push({
        externalId,
        league,
        homeTeam,
        awayTeam,
        commenceTime,
      });
    }

    // Fetch odds in batches of 10 using /odds/multi
    // Free tier allows 2 bookmakers; use Bet365 as a reliable default
    const eventIds = events.map((e) => e.externalId);

    for (let i = 0; i < eventIds.length; i += 10) {
      const batch = eventIds.slice(i, i + 10);
      const oddsUrl = `${getBaseUrl()}/odds/multi?apiKey=${getApiKey()}&eventIds=${batch.join(",")}&bookmakers=Bet365`;
      const oddsRes = await fetch(oddsUrl);
      if (!oddsRes.ok) {
        console.error(`Odds-API.io /odds/multi failed for batch ${i}: ${oddsRes.status}`);
        continue;
      }
      const oddsData = await oddsRes.json();
      const oddsArray = Array.isArray(oddsData) ? oddsData : [oddsData];

      for (const oddsItem of oddsArray) {
        const externalEventId = String(oddsItem.id);
        const event = events.find((e) => e.externalId === externalEventId);
        if (!event) continue;

        const picked = pickBookmaker(oddsItem.bookmakers || {});
        if (!picked) continue;

        const { homeOdds, awayOdds, drawOdds } = mapOutcomeToOdds(
          picked.market.odds || [],
          event.homeTeam,
          event.awayTeam
        );

        if (homeOdds > 0 && awayOdds > 0) {
          odds.push({
            externalEventId,
            marketType: "h2h",
            bookmakerKey: picked.key,
            homeOdds,
            awayOdds,
            drawOdds,
            fetchedAt,
          });
        }
      }
    }

    return { events, odds };
  }

  async fetchScores(league: string, daysFrom: number): Promise<NormalizedScore[]> {
    const { sport, league: leagueSlug } = resolveSportLeague(league);
    const now = new Date();
    const from = new Date(now.getTime() - daysFrom * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let url = `${getBaseUrl()}/events?apiKey=${getApiKey()}&sport=${encodeURIComponent(sport)}`;
    if (leagueSlug) {
      url += `&league=${encodeURIComponent(leagueSlug)}`;
    }
    url += `&status=live,settled&from=${from.toISOString()}&to=${to.toISOString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Odds-API.io /events (scores) failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();

    const scores: NormalizedScore[] = [];
    for (const item of data) {
      const externalEventId = String(item.id);
      const statusRaw = String(item.status || "").toLowerCase();
      let status: NormalizedScore["status"] = "scheduled";
      if (statusRaw === "settled" || statusRaw === "finished" || statusRaw === "completed") {
        status = "completed";
      } else if (statusRaw === "live" || statusRaw === "in_progress") {
        status = "live";
      } else if (statusRaw === "postponed") {
        status = "postponed";
      } else if (statusRaw === "cancelled") {
        status = "cancelled";
      }

      const scoreObj = item.scores || {};
      const homeScore = scoreObj.home != null ? Number(scoreObj.home) : null;
      const awayScore = scoreObj.away != null ? Number(scoreObj.away) : null;

      const completedAt = status === "completed" ? new Date(item.updatedAt || item.date || now) : null;

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
