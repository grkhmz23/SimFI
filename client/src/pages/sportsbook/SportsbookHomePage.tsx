import { useState } from "react";
import { useSportsbookEvents } from "@/hooks/useSportsbookEvents";
import { EventCard } from "@/components/sportsbook/EventCard";
import { BetSlip } from "@/components/sportsbook/BetSlip";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SportsbookEvent } from "@/lib/sportsbookApi";

const LEAGUES = [
  { key: "basketball_nba", label: "NBA" },
  { key: "americanfootball_nfl", label: "NFL" },
  { key: "soccer_epl", label: "EPL" },
  { key: "soccer_uefa_champs_league", label: "UCL" },
];

export default function SportsbookHomePage() {
  const [activeLeague, setActiveLeague] = useState<string>(LEAGUES[0].key);
  const [betSlipOpen, setBetSlipOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<SportsbookEvent | null>(null);
  const [selectedSelection, setSelectedSelection] = useState<"home" | "away" | "draw" | null>(null);
  const [selectedOdds, setSelectedOdds] = useState(0);

  const { data: events, isLoading } = useSportsbookEvents(activeLeague);

  const upcomingEvents = events?.filter((e) => new Date(e.commenceTime) > new Date()) ?? [];

  function handleSelectOdds(event: SportsbookEvent, selection: "home" | "away" | "draw", odds: number) {
    setSelectedEvent(event);
    setSelectedSelection(selection);
    setSelectedOdds(odds);
    setBetSlipOpen(true);
  }

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-display text-[var(--text-primary)]">Sportsbook</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Paper bet on real sports with live odds
        </p>
      </div>

      <Tabs value={activeLeague} onValueChange={setActiveLeague} className="mb-6">
        <TabsList className="bg-[var(--bg-raised)]">
          {LEAGUES.map((l) => (
            <TabsTrigger
              key={l.key}
              value={l.key}
              className="text-xs data-[state=active]:bg-[var(--bg-surface)]"
            >
              {l.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      )}

      {upcomingEvents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {upcomingEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onSelectOdds={handleSelectOdds}
            />
          ))}
        </div>
      )}

      {upcomingEvents.length === 0 && !isLoading && (
        <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
          No upcoming events in this league this week.
        </div>
      )}

      <BetSlip
        open={betSlipOpen}
        onClose={() => setBetSlipOpen(false)}
        event={selectedEvent}
        selection={selectedSelection}
        odds={selectedOdds}
      />
    </div>
  );
}
