import { useState } from "react";
import { useParams, Link } from "wouter";
import { usePredictionMarket } from "@/hooks/usePredictionMarket";
import { PredictionPriceChart } from "@/components/predictions/PredictionPriceChart";
import { PredictionTradeModal } from "@/components/predictions/PredictionTradeModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd, formatPct, formatCount } from "@/lib/format";
import { ArrowLeft, TrendingUp, Droplets, Calendar } from "lucide-react";

interface PredictionMarketDetailPageProps {
  slug?: string;
}

export default function PredictionMarketDetailPage({ slug: propSlug }: PredictionMarketDetailPageProps) {
  const params = useParams();
  const slug = propSlug || params.slug;
  const { data: market, isLoading } = usePredictionMarket(slug || "");
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  if (isLoading) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
        <p className="text-sm text-[var(--text-tertiary)]">Market not found.</p>
      </div>
    );
  }

  const yesPrice = market.outcomePrices[0] ?? 0;
  const noPrice = market.outcomePrices[1] ?? 0;
  const yesPct = yesPrice * 100;
  const noPct = noPrice * 100;

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
      <Link href="/predictions" className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4">
        <ArrowLeft className="h-3 w-3" />
        Back to markets
      </Link>

      <div className="mb-6">
        <h1 className="text-h1 text-[var(--text-primary)]">{market.question}</h1>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <Badge variant={market.active ? "default" : "secondary"} className="text-[10px]">
            {market.active ? "Active" : "Inactive"}
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

      {/* YES/NO bars */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--accent-gain)]">YES</span>
            <span className="text-lg font-mono font-bold text-[var(--text-primary)]">
              {yesPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent-gain)]"
              style={{ width: `${yesPct}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
            {formatUsd(yesPrice)} / share
          </p>
        </div>

        <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--accent-loss)]">NO</span>
            <span className="text-lg font-mono font-bold text-[var(--text-primary)]">
              {noPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent-loss)]"
              style={{ width: `${noPct}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
            {formatUsd(noPrice)} / share
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4 mb-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">Price History</h3>
        <PredictionPriceChart tokenId={market.yesTokenId} />
      </div>

      {/* Trade buttons */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => {
            setTradeMode("buy");
            setShowTradeModal(true);
          }}
          className="bg-[var(--accent-gain)] hover:bg-[var(--accent-gain)]/90"
        >
          Trade
        </Button>
      </div>

      {showTradeModal && (
        <PredictionTradeModal
          market={market}
          onClose={() => setShowTradeModal(false)}
        />
      )}
    </div>
  );
}
