import { useQuery } from "@tanstack/react-query";
import { fetchEventById } from "@/lib/sportsbookApi";

export function useSportsbookEvent(id?: string) {
  return useQuery({
    queryKey: ["/api/sportsbook/events", id],
    queryFn: () => fetchEventById(id!),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!id,
  });
}
