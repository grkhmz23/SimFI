import { useQuery } from "@tanstack/react-query";
import { fetchPositions } from "@/lib/predictionApi";

export function usePredictionPositions() {
  return useQuery({
    queryKey: ["/api/predictions/me/positions"],
    queryFn: fetchPositions,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
