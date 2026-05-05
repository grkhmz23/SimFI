import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OddsButton } from "./OddsButton";
import type { SportsbookEvent } from "@/lib/sportsbookApi";
import { Calendar } from "lucide-react";

interface EventCardProps {
  event: SportsbookEvent;
  onSelectOdds: (event: SportsbookEvent, selection: "home" | "away" | "draw", odds: number) => void;
}

export function EventCard({ event, onSelectOdds }: EventCardProps) {
  const isLocked = new Date(event.commenceTime) <= new Date();
  const market = event.market;

  return (
    <Card className={isLocked ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px]">
                {event.league.replace(/_/g, " ").toUpperCase()}
              </Badge>
              {isLocked && (
                <Badge variant="secondary" className="text-[10px]">
                  Started
                </Badge>
              )}
            </div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] leading-snug">
              {event.homeTeam} <span className="text-[var(--text-tertiary)]">vs</span> {event.awayTeam}
            </h3>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                <Calendar className="h-3 w-3" />
                {new Date(event.commenceTime).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {market && !isLocked && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <OddsButton
              label={event.homeTeam}
              odds={market.homeOdds}
              onClick={() => onSelectOdds(event, "home", market.homeOdds)}
            />
            <OddsButton
              label={event.awayTeam}
              odds={market.awayOdds}
              onClick={() => onSelectOdds(event, "away", market.awayOdds)}
            />
            {market.drawOdds != null && (
              <OddsButton
                label="Draw"
                odds={market.drawOdds}
                onClick={() => onSelectOdds(event, "draw", market.drawOdds!)}
                className="col-span-2"
              />
            )}
          </div>
        )}

        {isLocked && (
          <div className="mt-4 text-center text-xs text-[var(--text-tertiary)] py-2 border border-dashed border-[var(--border-subtle)] rounded-md">
            Event has started — betting closed
          </div>
        )}
      </CardContent>
    </Card>
  );
}
