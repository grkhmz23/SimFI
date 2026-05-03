import { useQuery } from "@tanstack/react-query";
import { fetchTrades } from "@/lib/predictionApi";

export function usePredictionTrades(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["/api/predictions/me/trades", limit, offset],
    queryFn: () => fetchTrades(limit, offset),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
