import { formatUsd } from "@/lib/format";
import type { PredictionTrade } from "@/lib/predictionApi";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PredictionTradeHistoryRowProps {
  trade: PredictionTrade;
}

export function PredictionTradeHistoryRow({ trade }: PredictionTradeHistoryRowProps) {
  const isBuy = trade.side === "BUY";

  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)] last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center",
            isBuy ? "bg-[var(--accent-gain)]/10" : "bg-[var(--accent-loss)]/10"
          )}
        >
          {isBuy ? (
            <ArrowUpRight className="h-4 w-4 text-[var(--accent-gain)]" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-[var(--accent-loss)]" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {trade.side} {trade.outcome}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)]">
            {new Date(trade.createdAt).toLocaleDateString()}{" "}
            {new Date(trade.createdAt).toLocaleTimeString()}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-mono text-[var(--text-primary)]">
          {trade.shares.toFixed(2)} shares
        </p>
        <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
          {formatUsd(trade.totalUsd)} @ {formatUsd(trade.avgPrice)}
        </p>
      </div>
    </div>
  );
}


