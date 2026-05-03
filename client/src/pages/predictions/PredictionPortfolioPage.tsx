import { useState } from "react";
import { usePredictionPositions } from "@/hooks/usePredictionPositions";
import { usePredictionTrades } from "@/hooks/usePredictionTrades";
import { usePredictionBalance } from "@/hooks/usePredictionBalance";
import { PredictionPositionRow } from "@/components/predictions/PredictionPositionRow";
import { PredictionTradeHistoryRow } from "@/components/predictions/PredictionTradeHistoryRow";
import { PredictionBalanceBadge } from "@/components/predictions/PredictionBalanceBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd } from "@/lib/format";
import { Wallet, History, TrendingUp } from "lucide-react";

export default function PredictionPortfolioPage() {
  const { data: positions, isLoading: posLoading } = usePredictionPositions();
  const { data: trades, isLoading: tradesLoading } = usePredictionTrades();
  const { data: balance } = usePredictionBalance();

  const totalCostBasis = positions?.reduce((sum, p) => sum + p.costBasisUsd, 0) ?? 0;
  const totalRealizedPnl = positions?.reduce((sum, p) => sum + p.realizedPnlUsd, 0) ?? 0;

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display text-[var(--text-primary)]">Portfolio</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Your prediction market positions and history
          </p>
        </div>
        <PredictionBalanceBadge />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-[var(--text-tertiary)]" />
            <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              Balance
            </span>
          </div>
          <p className="text-xl font-mono font-bold text-[var(--text-primary)]">
            {formatUsd(balance?.balanceUsd ?? 0)}
          </p>
        </div>

        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-[var(--text-tertiary)]" />
            <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              Invested
            </span>
          </div>
          <p className="text-xl font-mono font-bold text-[var(--text-primary)]">
            {formatUsd(totalCostBasis)}
          </p>
        </div>

        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <History className="h-4 w-4 text-[var(--text-tertiary)]" />
            <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              Realized PnL
            </span>
          </div>
          <p
            className={`text-xl font-mono font-bold ${
              totalRealizedPnl >= 0 ? "text-[var(--accent-gain)]" : "text-[var(--accent-loss)]"
            }`}
          >
            {formatUsd(totalRealizedPnl)}
          </p>
        </div>
      </div>

      <Tabs defaultValue="positions">
        <TabsList className="bg-[var(--bg-raised)] border border-[var(--border-subtle)]">
          <TabsTrigger value="positions" className="text-xs">
            Positions
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-4">
          {posLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {positions && positions.length > 0 && (
            <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
              {positions.map((pos) => (
                <PredictionPositionRow key={pos.id} position={pos} />
              ))}
            </div>
          )}

          {positions && positions.length === 0 && !posLoading && (
            <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
              No open positions. Start trading!
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {tradesLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {trades && trades.length > 0 && (
            <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
              {trades.map((trade) => (
                <PredictionTradeHistoryRow key={trade.id} trade={trade} />
              ))}
            </div>
          )}

          {trades && trades.length === 0 && !tradesLoading && (
            <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
              No trades yet.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
