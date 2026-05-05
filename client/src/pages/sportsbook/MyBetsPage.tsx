import { useState } from "react";
import { useMyBets } from "@/hooks/useMyBets";
import { BetHistoryTable } from "@/components/sportsbook/BetHistoryTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MyBetsPage() {
  const [status, setStatus] = useState<"open" | "settled">("open");
  const { data: bets, isLoading } = useMyBets(status);

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-display text-[var(--text-primary)]">My Bets</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Track your open and settled sportsbook bets
        </p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as "open" | "settled")} className="mb-6">
        <TabsList className="bg-[var(--bg-raised)]">
          <TabsTrigger value="open" className="text-xs data-[state=active]:bg-[var(--bg-surface)]">
            Open
          </TabsTrigger>
          <TabsTrigger value="settled" className="text-xs data-[state=active]:bg-[var(--bg-surface)]">
            Settled
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      )}

      {bets && <BetHistoryTable bets={bets} />}
    </div>
  );
}
