import { useMutation, useQueryClient } from "@tanstack/react-query";
import { placeBet } from "@/lib/sportsbookApi";

export function usePlaceBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: placeBet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sportsbook/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}
