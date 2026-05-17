import { useState, useMemo } from "react";
import { usePredictionMarkets } from "@/hooks/usePredictionMarkets";
import { PredictionMarketCard } from "@/components/predictions/PredictionMarketCard";
import { PredictionBalanceBadge } from "@/components/predictions/PredictionBalanceBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, RefreshCw, AlertCircle } from "lucide-react";

type StatusFilter = "all" | "active" | "closed";

export default function PredictionMarketsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const { data: markets, isLoading, isError, refetch } = usePredictionMarkets(200, 0);

  const filtered = useMemo(() => {
    if (!markets) return [];
    let list = markets;
    if (statusFilter === "active") list = list.filter((m) => m.active && !m.closed);
    else if (statusFilter === "closed") list = list.filter((m) => m.closed || !m.active);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.question.toLowerCase().includes(q));
    }
    return list;
  }, [markets, search, statusFilter]);

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-display text-[var(--text-primary)]">Predictions</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Trade on real-world events with paper USD
          </p>
        </div>
        <PredictionBalanceBadge />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <Input
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)]"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList className="bg-[var(--bg-raised)] h-9">
            <TabsTrigger value="active" className="text-xs data-[state=active]:bg-[var(--bg-surface)]">
              Active
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs data-[state=active]:bg-[var(--bg-surface)]">
              All
            </TabsTrigger>
            <TabsTrigger value="closed" className="text-xs data-[state=active]:bg-[var(--bg-surface)]">
              Closed
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)]">Failed to load prediction markets</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((market) => (
            <PredictionMarketCard key={market.conditionId} market={market} />
          ))}
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-[var(--text-secondary)] mb-1">
            {search.trim() ? `No markets matching "${search}"` : "No markets in this category"}
          </p>
          {search.trim() && (
            <button
              onClick={() => setSearch("")}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  );
}
