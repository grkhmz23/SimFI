import { useQuery } from "@tanstack/react-query";
import { fetchMyBets } from "@/lib/sportsbookApi";

export function useMyBets(status?: "open" | "settled") {
  return useQuery({
    queryKey: ["/api/sportsbook/bets", status],
    queryFn: () => fetchMyBets(status),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
