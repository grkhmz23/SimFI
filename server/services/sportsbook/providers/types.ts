export interface NormalizedEvent {
  externalId: string;
  league: string; // sport_key
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
}

export interface NormalizedOdds {
  externalEventId: string;
  marketType: "h2h";
  bookmakerKey: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number | null;
  fetchedAt: Date;
}

export interface NormalizedScore {
  externalEventId: string;
  status: "scheduled" | "live" | "completed" | "postponed" | "cancelled";
  homeScore: number | null;
  awayScore: number | null;
  completedAt: Date | null;
  raw: unknown;
}

export interface OddsProvider {
  name: string;
  fetchEventsWithOdds(league: string): Promise<{
    events: NormalizedEvent[];
    odds: NormalizedOdds[];
  }>;
  fetchScores(league: string, daysFrom: number): Promise<NormalizedScore[]>;
}
