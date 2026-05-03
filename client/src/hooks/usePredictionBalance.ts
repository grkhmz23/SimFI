import { useQuery } from "@tanstack/react-query";
import { fetchBalance } from "@/lib/predictionApi";

export function usePredictionBalance() {
  return useQuery({
    queryKey: ["/api/predictions/me/balance"],
    queryFn: fetchBalance,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
