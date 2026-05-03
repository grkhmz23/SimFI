import { useMutation, useQueryClient } from "@tanstack/react-query";
import { executeTrade } from "@/lib/predictionApi";

export function usePredictionTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: executeTrade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/me/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/me/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/me/balance"] });
    },
  });
}
