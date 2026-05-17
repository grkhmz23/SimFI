import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OddsButton } from "./OddsButton";
import type { SportsbookEvent } from "@/lib/sportsbookApi";
import { Calendar, Lock } from "lucide-react";

interface EventCardProps {
  event: SportsbookEvent;
  activeSelection?: "home" | "away" | "draw" | null;
  onSelectOdds: (event: SportsbookEvent, selection: "home" | "away" | "draw", odds: number) => void;
}

export function EventCard({ event, activeSelection, onSelectOdds }: EventCardProps) {
  const isLocked = new Date(event.commenceTime) <= new Date();
  const market = event.market;

  const startTime = new Date(event.commenceTime);
  const timeLabel = startTime.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  }) + " · " + startTime.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card className={isLocked ? "opacity-60" : "transition-shadow hover:shadow-md"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] shrink-0">
                {event.league.replace(/_/g, " ").toUpperCase()}
              </Badge>
              {isLocked ? (
                <Badge variant="secondary" className="text-[10px] shrink-0 gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  Started
                </Badge>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                  <Calendar className="h-3 w-3" />
                  {timeLabel}
                </span>
              )}
            </div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] leading-snug">
              {event.homeTeam}
              <span className="text-[var(--text-tertiary)] mx-1.5">vs</span>
              {event.awayTeam}
            </h3>
          </div>
        </div>

        {market && !isLocked && (
          <div className={`grid gap-2 mt-3 ${market.drawOdds != null ? "grid-cols-3" : "grid-cols-2"}`}>
            <OddsButton
              label={event.homeTeam}
              odds={market.homeOdds}
              selected={activeSelection === "home"}
              onClick={() => onSelectOdds(event, "home", market.homeOdds)}
            />
            <OddsButton
              label={event.awayTeam}
              odds={market.awayOdds}
              selected={activeSelection === "away"}
              onClick={() => onSelectOdds(event, "away", market.awayOdds)}
            />
            {market.drawOdds != null && (
              <OddsButton
                label="Draw"
                odds={market.drawOdds}
                selected={activeSelection === "draw"}
                onClick={() => onSelectOdds(event, "draw", market.drawOdds!)}
              />
            )}
          </div>
        )}

        {!market && !isLocked && (
          <div className="mt-3 text-center text-xs text-[var(--text-tertiary)] py-2 border border-dashed border-[var(--border-subtle)] rounded-md">
            Odds unavailable
          </div>
        )}

        {isLocked && (
          <div className="mt-3 text-center text-xs text-[var(--text-tertiary)] py-2 border border-dashed border-[var(--border-subtle)] rounded-md">
            Betting closed · Event started
          </div>
        )}
      </CardContent>
    </Card>
  );
}
