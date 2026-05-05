import { useQuery } from "@tanstack/react-query";
import { fetchEvents } from "@/lib/sportsbookApi";

export function useSportsbookEvents(league?: string) {
  return useQuery({
    queryKey: ["/api/sportsbook/events", league],
    queryFn: () => fetchEvents(league),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: true,
  });
}
