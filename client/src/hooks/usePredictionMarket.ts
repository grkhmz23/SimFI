import { useQuery } from "@tanstack/react-query";
import { fetchMarketBySlug } from "@/lib/predictionApi";

export function usePredictionMarket(slug: string) {
  return useQuery({
    queryKey: ["/api/predictions/markets", slug],
    queryFn: () => fetchMarketBySlug(slug),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!slug,
  });
}
