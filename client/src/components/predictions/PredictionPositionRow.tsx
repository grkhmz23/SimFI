import { formatUsd } from "@/lib/format";
import type { PredictionPosition } from "@/lib/predictionApi";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PredictionPositionRowProps {
  position: PredictionPosition;
  onSell?: () => void;
}

export function PredictionPositionRow({ position, onSell }: PredictionPositionRowProps) {
  const pnl = position.realizedPnlUsd;
  const isWin = pnl > 0;
  const isLoss = pnl < 0;

  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)] last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
            position.outcome === "YES"
              ? "bg-[var(--accent-gain)]/10 text-[var(--accent-gain)]"
              : "bg-[var(--accent-loss)]/10 text-[var(--accent-loss)]"
          )}
        >
          {position.outcome === "YES" ? "Y" : "N"}
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {position.outcome}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)] font-mono">
            {position.shares.toFixed(2)} shares @ {formatUsd(position.avgPrice)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-mono text-[var(--text-primary)]">
            {formatUsd(position.shares * position.avgPrice)}
          </p>
          <p
            className={cn(
              "text-[10px] font-mono flex items-center justify-end gap-0.5",
              isWin && "text-[var(--accent-gain)]",
              isLoss && "text-[var(--accent-loss)]",
              !isWin && !isLoss && "text-[var(--text-tertiary)]"
            )}
          >
            {isWin && <TrendingUp className="h-3 w-3" />}
            {isLoss && <TrendingDown className="h-3 w-3" />}
            {!isWin && !isLoss && <Minus className="h-3 w-3" />}
            {formatUsd(Math.abs(pnl))}
          </p>
        </div>
        {onSell && (
          <Button size="sm" variant="ghost" onClick={onSell} className="text-[var(--accent-loss)]">
            Sell
          </Button>
        )}
      </div>
    </div>
  );
}


