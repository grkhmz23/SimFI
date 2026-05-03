import { useQuery } from "@tanstack/react-query";
import { fetchMarkets } from "@/lib/predictionApi";

export function usePredictionMarkets(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["/api/predictions/markets", limit, offset],
    queryFn: () => fetchMarkets(limit, offset),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
