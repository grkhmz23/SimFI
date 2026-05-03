import { useState } from "react";
import { usePredictionMarkets } from "@/hooks/usePredictionMarkets";
import { PredictionMarketCard } from "@/components/predictions/PredictionMarketCard";
import { PredictionBalanceBadge } from "@/components/predictions/PredictionBalanceBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function PredictionMarketsPage() {
  const [search, setSearch] = useState("");
  const { data: markets, isLoading } = usePredictionMarkets(200, 0);

  const filtered = markets?.filter((m) =>
    m.question.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display text-[var(--text-primary)]">Predictions</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Trade on real-world events with paper USD
          </p>
        </div>
        <PredictionBalanceBadge />
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
        <Input
          placeholder="Search markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)]"
        />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((market) => (
            <PredictionMarketCard key={market.conditionId} market={market} />
          ))}
        </div>
      )}

      {filtered && filtered.length === 0 && !isLoading && (
        <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
          No markets found.
        </div>
      )}
    </div>
  );
}
