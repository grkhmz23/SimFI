import { useState } from "react";
import { useMyBets } from "@/hooks/useMyBets";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { BetHistoryTable } from "@/components/sportsbook/BetHistoryTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, RefreshCw, LogIn } from "lucide-react";

export default function MyBetsPage() {
  const [status, setStatus] = useState<"open" | "settled">("open");
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: bets, isLoading, isError, refetch } = useMyBets(isAuthenticated ? status : undefined);

  if (!isAuthenticated) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
        <div className="min-h-[60vh] flex items-center justify-center">
          <Card className="card-raised p-12 text-center max-w-md">
            <LogIn className="h-12 w-12 mx-auto text-[var(--text-secondary)] mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">Login Required</h2>
            <p className="text-[var(--text-secondary)] mb-6">
              Log in to view your sportsbook bet history.
            </p>
            <Button onClick={() => setLocation("/login")}>Login</Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
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
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)]">Failed to load bets</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && bets && <BetHistoryTable bets={bets} />}
    </div>
  );
}
