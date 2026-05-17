import { apiRequest } from "./queryClient";

export interface SportsbookEvent {
  id: string;
  externalId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  completedAt: string | null;
  voidedReason: string | null;
  createdAt: string;
  updatedAt: string;
  market: SportsbookMarket | null;
}

export interface SportsbookMarket {
  id: string;
  eventId: string;
  marketType: string;
  bookmakerKey: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number | null;
  fetchedAt: string;
  isLatest: boolean;
}

export interface SportsbookBet {
  id: string;
  userId: string;
  chain: string;
  eventId: string;
  marketId: string;
  selection: "home" | "away" | "draw";
  stake: string;
  oddsAtPlacement: number;
  potentialPayout: string;
  status: string;
  placedAt: string;
  settledAt: string | null;
  payoutAmount: string | null;
  bookmakerKey: string;
  notes: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  commenceTime: string | null;
}

export interface PlaceBetRequest {
  eventId: string;
  selection: "home" | "away" | "draw";
  chain: "solana" | "base";
  stake: string;
  expectedOdds: number;
  slippageBps: number;
  idempotencyKey?: string;
}

export interface PlaceBetResponse {
  betId: string;
  userId: string;
  eventId: string;
  selection: string;
  chain: string;
  stake: string;
  oddsAtPlacement: number;
  potentialPayout: string;
  status: string;
  placedAt: string;
}

export interface LeagueInfo {
  league: string;
  eventCount: number;
  upcomingCount: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  totalBets: number;
  wonBets: number;
  totalStaked: string;
  totalPayout: string;
  netPnl: string;
}

export async function fetchLeagues(): Promise<LeagueInfo[]> {
  return apiRequest("GET", "/api/sportsbook/leagues");
}

export async function fetchEvents(league?: string, from?: string, to?: string): Promise<SportsbookEvent[]> {
  const params = new URLSearchParams();
  if (league) params.set("league", league);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return apiRequest("GET", `/api/sportsbook/events${qs ? "?" + qs : ""}`);
}

export async function fetchEventById(id: string): Promise<{
  event: SportsbookEvent;
  latestMarket: SportsbookMarket | null;
  marketHistory: SportsbookMarket[];
}> {
  return apiRequest("GET", `/api/sportsbook/events/${encodeURIComponent(id)}`);
}

export async function placeBet(body: PlaceBetRequest): Promise<PlaceBetResponse> {
  return apiRequest("POST", "/api/sportsbook/bets", body);
}

export async function fetchMyBets(status?: "open" | "settled"): Promise<SportsbookBet[]> {
  const qs = status ? `?status=${status}` : "";
  return apiRequest("GET", `/api/sportsbook/bets${qs}`);
}

export async function fetchLeaderboard(league?: string, period?: string): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams();
  if (league) params.set("league", league);
  if (period) params.set("period", period);
  const qs = params.toString();
  return apiRequest("GET", `/api/sportsbook/leaderboard${qs ? "?" + qs : ""}`);
}
