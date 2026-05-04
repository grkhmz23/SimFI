import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "@/lib/predictionApi";

export function usePredictionStats() {
  return useQuery({
    queryKey: ["/api/predictions/me/stats"],
    queryFn: fetchStats,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
