import { usePredictionBalance } from "@/hooks/usePredictionBalance";
import { formatUsd } from "@/lib/format";
import { Loader2 } from "lucide-react";

export function PredictionBalanceBadge() {
  const { data, isLoading } = usePredictionBalance();

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-[var(--text-secondary)]">Paper Balance</span>
      <span className="font-mono font-medium text-[var(--text-primary)]">
        {formatUsd(data?.balanceUsd ?? 0)}
      </span>
    </div>
  );
}
