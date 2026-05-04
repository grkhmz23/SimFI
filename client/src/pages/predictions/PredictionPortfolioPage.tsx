import { useState } from "react";
import { usePredictionPositions } from "@/hooks/usePredictionPositions";
import { usePredictionTrades } from "@/hooks/usePredictionTrades";
import { usePredictionBalance } from "@/hooks/usePredictionBalance";
import { usePredictionStats } from "@/hooks/usePredictionStats";
import { PredictionPositionRow } from "@/components/predictions/PredictionPositionRow";
import { PredictionTradeHistoryRow } from "@/components/predictions/PredictionTradeHistoryRow";
import { PredictionBalanceBadge } from "@/components/predictions/PredictionBalanceBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd, formatCount, formatPct } from "@/lib/format";
import { Wallet, History, TrendingUp, Activity, Target, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

function StatCard({
  label,
  value,
  subvalue,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: React.ReactNode;
  subvalue?: React.ReactNode;
  icon: React.ElementType;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", colorClass || "text-[var(--text-tertiary)]")} />
        <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-xl font-mono font-bold text-[var(--text-primary)]">{value}</p>
      {subvalue && (
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{subvalue}</p>
      )}
    </div>
  );
}

export default function PredictionPortfolioPage() {
  const { data: positions, isLoading: posLoading } = usePredictionPositions();
  const { data: trades, isLoading: tradesLoading } = usePredictionTrades();
  const { data: balance, isLoading: balanceLoading } = usePredictionBalance();
  const { data: stats, isLoading: statsLoading } = usePredictionStats();

  const totalCostBasis = positions?.reduce((sum, p) => sum + p.costBasisUsd, 0) ?? 0;
  const realizedPnl = balance?.realizedPnlUsd ?? 0;

  const isLoading = balanceLoading || statsLoading;

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

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {isLoading ? (
          <>
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </>
        ) : (
          <>
            <StatCard
              label="Balance"
              value={formatUsd(balance?.balanceUsd ?? 0)}
              icon={Wallet}
            />
            <StatCard
              label="Invested"
              value={formatUsd(totalCostBasis)}
              icon={Layers}
            />
            <StatCard
              label="Realized PnL"
              value={formatUsd(realizedPnl)}
              icon={TrendingUp}
              colorClass={realizedPnl >= 0 ? "text-[var(--accent-gain)]" : "text-[var(--accent-loss)]"}
            />
            <StatCard
              label="Total Trades"
              value={formatCount(stats?.totalTrades ?? 0)}
              subvalue={
                stats ? (
                  <span className="text-[var(--text-secondary)]">
                    {stats.buyCount} buys · {stats.sellCount} sells
                  </span>
                ) : undefined
              }
              icon={Activity}
            />
            <StatCard
              label="Win Rate"
              value={formatPct((stats?.winRate ?? 0) * 100)}
              subvalue={
                stats ? (
                  <span className="text-[var(--text-secondary)]">
                    {stats.winCount}W / {stats.lossCount}L
                  </span>
                ) : undefined
              }
              icon={Target}
              colorClass={
                (stats?.winRate ?? 0) >= 0.5
                  ? "text-[var(--accent-gain)]"
                  : "text-[var(--accent-loss)]"
              }
            />
            <StatCard
              label="Open Positions"
              value={formatCount(stats?.openPositionsCount ?? 0)}
              icon={History}
            />
          </>
        )}
      </div>

      {/* Win rate visual bar */}
      {!isLoading && stats && stats.winCount + stats.lossCount > 0 && (
        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              Performance
            </span>
            <span className="text-xs font-mono text-[var(--text-primary)]">
              {formatPct((stats.winRate ?? 0) * 100)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--bg-base)] overflow-hidden flex">
            <div
              className="h-full rounded-full bg-[var(--accent-gain)]"
              style={{ width: `${(stats.winRate ?? 0) * 100}%` }}
            />
            <div
              className="h-full rounded-full bg-[var(--accent-loss)]"
              style={{ width: `${(1 - (stats.winRate ?? 0)) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-[var(--accent-gain)]">
              {stats.winCount} wins
            </span>
            <span className="text-[10px] text-[var(--accent-loss)]">
              {stats.lossCount} losses
            </span>
          </div>
        </div>
      )}

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
