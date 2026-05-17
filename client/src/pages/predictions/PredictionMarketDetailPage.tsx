import { useState } from "react";
import { useParams, Link } from "wouter";
import { usePredictionMarket } from "@/hooks/usePredictionMarket";
import { usePredictionPositions } from "@/hooks/usePredictionPositions";
import { PredictionPriceChart } from "@/components/predictions/PredictionPriceChart";
import { PredictionTradeModal } from "@/components/predictions/PredictionTradeModal";
import { PredictionBalanceBadge } from "@/components/predictions/PredictionBalanceBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd, formatCount } from "@/lib/format";
import { ArrowLeft, TrendingUp, Droplets, Calendar, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PredictionMarketDetailPageProps {
  slug?: string;
}

export default function PredictionMarketDetailPage({ slug: propSlug }: PredictionMarketDetailPageProps) {
  const params = useParams();
  const slug = propSlug || params.slug;
  const { data: market, isLoading, isError, refetch } = usePredictionMarket(slug || "");
  const { data: positions } = usePredictionPositions();

  const [showTradeModal, setShowTradeModal] = useState(false);
  const [initialOutcome, setInitialOutcome] = useState<"YES" | "NO">("YES");
  const [initialSide, setInitialSide] = useState<"BUY" | "SELL">("BUY");

  function openBuy(outcome: "YES" | "NO") {
    setInitialOutcome(outcome);
    setInitialSide("BUY");
    setShowTradeModal(true);
  }

  if (isLoading) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
        <Skeleton className="h-4 w-40 mb-6" />
        <Skeleton className="h-8 w-full mb-4" />
        <Skeleton className="h-32 w-full rounded-lg mb-4" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
        <Link href="/predictions" className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 w-fit">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to markets
        </Link>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)]">Failed to load market</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
        <Link href="/predictions" className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 w-fit">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to markets
        </Link>
        <p className="text-sm text-[var(--text-tertiary)]">Market not found.</p>
      </div>
    );
  }

  const yesPrice = market.outcomePrices[0] ?? 0;
  const noPrice = market.outcomePrices[1] ?? 0;
  const yesPct = yesPrice * 100;
  const noPct = noPrice * 100;

  const yesPosition = positions?.find(
    (p) => p.conditionId === market.conditionId && p.outcome === "YES"
  );
  const noPosition = positions?.find(
    (p) => p.conditionId === market.conditionId && p.outcome === "NO"
  );

  const isClosed = market.closed || !market.active;

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/predictions"
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to markets
        </Link>
        <PredictionBalanceBadge />
      </div>

      <div className="mb-6">
        <h1 className="text-h1 text-[var(--text-primary)]">{market.question}</h1>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <Badge variant={market.active ? "default" : "secondary"} className="text-[10px]">
            {market.active ? "Active" : "Closed"}
          </Badge>
          {market.endDate && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
              <Calendar className="h-3 w-3" />
              Ends {new Date(market.endDate).toLocaleDateString()}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
            <TrendingUp className="h-3 w-3" />
            Vol {formatCount(market.volume24hr)}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
            <Droplets className="h-3 w-3" />
            {formatUsd(market.liquidity)}
          </span>
        </div>
      </div>

      {/* YES/NO probability + bet buttons */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* YES */}
        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--accent-gain)]">YES</span>
            <span className="text-lg font-mono font-bold text-[var(--text-primary)]">
              {yesPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--bg-base)] overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-[var(--accent-gain)]"
              style={{ width: `${yesPct}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] mb-3">
            {formatUsd(yesPrice)} / share
          </p>
          {yesPosition && yesPosition.shares > 0 && (
            <p className="text-[10px] text-[var(--accent-gain)] mb-2 font-mono">
              You hold {yesPosition.shares.toFixed(2)} shares
            </p>
          )}
          <Button
            size="sm"
            className={cn(
              "w-full text-xs",
              isClosed
                ? "opacity-50 cursor-not-allowed"
                : "bg-[var(--accent-gain)] hover:bg-[var(--accent-gain)]/90"
            )}
            disabled={isClosed}
            onClick={() => openBuy("YES")}
          >
            {isClosed ? "Closed" : "Buy YES"}
          </Button>
        </div>

        {/* NO */}
        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--accent-loss)]">NO</span>
            <span className="text-lg font-mono font-bold text-[var(--text-primary)]">
              {noPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--bg-base)] overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-[var(--accent-loss)]"
              style={{ width: `${noPct}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] mb-3">
            {formatUsd(noPrice)} / share
          </p>
          {noPosition && noPosition.shares > 0 && (
            <p className="text-[10px] text-[var(--accent-loss)] mb-2 font-mono">
              You hold {noPosition.shares.toFixed(2)} shares
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "w-full text-xs",
              !isClosed && "border-[var(--accent-loss)] text-[var(--accent-loss)] hover:bg-[var(--accent-loss)]/10"
            )}
            disabled={isClosed}
            onClick={() => openBuy("NO")}
          >
            {isClosed ? "Closed" : "Buy NO"}
          </Button>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4 mb-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">Price History</h3>
        <PredictionPriceChart tokenId={market.yesTokenId} />
      </div>

      {/* Sell shortcut — only if user has a position */}
      {((yesPosition?.shares ?? 0) > 0 || (noPosition?.shares ?? 0) > 0) && !isClosed && (
        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4 mb-6">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Your Position</h3>
          <div className="space-y-2">
            {yesPosition && yesPosition.shares > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--accent-gain)] font-mono">
                  YES — {yesPosition.shares.toFixed(2)} shares @ {formatUsd(yesPosition.avgPrice)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-[var(--accent-loss)] h-7"
                  onClick={() => { setInitialOutcome("YES"); setInitialSide("SELL"); setShowTradeModal(true); }}
                >
                  Sell
                </Button>
              </div>
            )}
            {noPosition && noPosition.shares > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--accent-loss)] font-mono">
                  NO — {noPosition.shares.toFixed(2)} shares @ {formatUsd(noPosition.avgPrice)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-[var(--accent-loss)] h-7"
                  onClick={() => { setInitialOutcome("NO"); setInitialSide("SELL"); setShowTradeModal(true); }}
                >
                  Sell
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {showTradeModal && (
        <PredictionTradeModal
          market={market}
          initialOutcome={initialOutcome}
          initialSide={initialSide}
          onClose={() => setShowTradeModal(false)}
        />
      )}
    </div>
  );
}
