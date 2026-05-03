import { useMutation } from "@tanstack/react-query";
import { createQuote } from "@/lib/predictionApi";

export function usePredictionQuote() {
  return useMutation({
    mutationFn: createQuote,
  });
}
