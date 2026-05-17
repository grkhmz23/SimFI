import { useState } from "react";
import { useParams, Link } from "wouter";
import { useSportsbookEvent } from "@/hooks/useSportsbookEvent";
import { BetSlip } from "@/components/sportsbook/BetSlip";
import { OddsButton } from "@/components/sportsbook/OddsButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Calendar, RefreshCw, AlertCircle, Lock } from "lucide-react";
import type { SportsbookEvent } from "@/lib/sportsbookApi";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useSportsbookEvent(id);

  const [betSlipOpen, setBetSlipOpen] = useState(false);
  const [selectedSelection, setSelectedSelection] = useState<"home" | "away" | "draw" | null>(null);
  const [selectedOdds, setSelectedOdds] = useState(0);

  if (isLoading) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
        <Skeleton className="h-4 w-32 mb-6" />
        <Skeleton className="h-32 rounded-lg mb-4" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
        <Link href="/sportsbook" className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sportsbook
        </Link>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)]">Failed to load event</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
        <Link href="/sportsbook" className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sportsbook
        </Link>
        <p className="text-sm text-[var(--text-tertiary)]">Event not found.</p>
      </div>
    );
  }

  const { event, latestMarket, marketHistory } = data;
  const isLocked = new Date(event.commenceTime) <= new Date();

  function handleSelectOdds(selection: "home" | "away" | "draw", eventOdds: number) {
    if (isLocked) return;
    if (selectedSelection === selection) {
      setSelectedSelection(null);
      setSelectedOdds(0);
      setBetSlipOpen(false);
      return;
    }
    setSelectedSelection(selection);
    setSelectedOdds(eventOdds);
    setBetSlipOpen(true);
  }

  const startTime = new Date(event.commenceTime);

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6 pb-20 lg:pb-6">
      <Link
        href="/sportsbook"
        className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Sportsbook
      </Link>

      {/* Event header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant="outline" className="text-[10px]">
            {event.league.replace(/_/g, " ").toUpperCase()}
          </Badge>
          {isLocked ? (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Lock className="h-2.5 w-2.5" />
              Started
            </Badge>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
              <Calendar className="h-3 w-3" />
              {startTime.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <h1 className="text-h1 text-[var(--text-primary)]">
          {event.homeTeam}
          <span className="text-[var(--text-tertiary)] mx-2">vs</span>
          {event.awayTeam}
        </h1>
      </div>

      {/* Current odds + bet buttons */}
      {latestMarket && !isLocked && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)] mb-3">Place a Bet</h2>
            <div className={`grid gap-3 ${latestMarket.drawOdds != null ? "grid-cols-3" : "grid-cols-2"}`}>
              <OddsButton
                label={event.homeTeam}
                odds={latestMarket.homeOdds}
                selected={selectedSelection === "home"}
                onClick={() => handleSelectOdds("home", latestMarket.homeOdds)}
              />
              <OddsButton
                label={event.awayTeam}
                odds={latestMarket.awayOdds}
                selected={selectedSelection === "away"}
                onClick={() => handleSelectOdds("away", latestMarket.awayOdds)}
              />
              {latestMarket.drawOdds != null && (
                <OddsButton
                  label="Draw"
                  odds={latestMarket.drawOdds}
                  selected={selectedSelection === "draw"}
                  onClick={() => handleSelectOdds("draw", latestMarket.drawOdds!)}
                />
              )}
            </div>
            {selectedSelection && (
              <Button className="w-full mt-3" onClick={() => setBetSlipOpen(true)}>
                Open Bet Slip
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {latestMarket && isLocked && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)] mb-3">Odds at Close</h2>
            <div className={`grid gap-3 ${latestMarket.drawOdds != null ? "grid-cols-3" : "grid-cols-2"}`}>
              <div className="text-center rounded-md border border-[var(--border-subtle)] p-3">
                <div className="text-xs text-[var(--text-secondary)] mb-1">{event.homeTeam}</div>
                <div className="text-lg font-mono font-semibold text-[var(--text-tertiary)]">
                  {latestMarket.homeOdds.toFixed(2)}
                </div>
              </div>
              {latestMarket.drawOdds != null && (
                <div className="text-center rounded-md border border-[var(--border-subtle)] p-3">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Draw</div>
                  <div className="text-lg font-mono font-semibold text-[var(--text-tertiary)]">
                    {latestMarket.drawOdds.toFixed(2)}
                  </div>
                </div>
              )}
              <div className="text-center rounded-md border border-[var(--border-subtle)] p-3">
                <div className="text-xs text-[var(--text-secondary)] mb-1">{event.awayTeam}</div>
                <div className="text-lg font-mono font-semibold text-[var(--text-tertiary)]">
                  {latestMarket.awayOdds.toFixed(2)}
                </div>
              </div>
            </div>
            <p className="text-xs text-center text-[var(--text-tertiary)] mt-3">
              Betting is closed — event has started
            </p>
          </CardContent>
        </Card>
      )}

      {!latestMarket && (
        <Card className="mb-6">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">
              No odds available for this event
            </p>
          </CardContent>
        </Card>
      )}

      {/* Odds history */}
      {marketHistory.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)] mb-3">Odds History</h2>
            <div className="space-y-0 max-h-64 overflow-y-auto">
              {marketHistory.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between text-xs py-2 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <span className="text-[var(--text-tertiary)]">
                    {new Date(m.fetchedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="font-mono text-[var(--text-primary)]">
                    {m.homeOdds.toFixed(2)} / {m.awayOdds.toFixed(2)}
                    {m.drawOdds != null ? ` / ${m.drawOdds.toFixed(2)}` : ""}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-[10px]">{m.bookmakerKey}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <BetSlip
        open={betSlipOpen}
        onClose={() => setBetSlipOpen(false)}
        event={event as SportsbookEvent}
        selection={selectedSelection}
        odds={selectedOdds}
      />
    </div>
  );
}
