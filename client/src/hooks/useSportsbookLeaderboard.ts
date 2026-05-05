import { useQuery } from "@tanstack/react-query";
import { fetchLeaderboard } from "@/lib/sportsbookApi";

export function useSportsbookLeaderboard(league?: string, period?: string) {
  return useQuery({
    queryKey: ["/api/sportsbook/leaderboard", league, period],
    queryFn: () => fetchLeaderboard(league, period),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
