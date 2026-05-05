import { useParams } from "wouter";
import { useSportsbookEvent } from "@/hooks/useSportsbookEvent";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useSportsbookEvent(id);

  if (isLoading) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
        <Skeleton className="h-32 rounded-lg mb-4" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 py-6 text-sm text-[var(--text-tertiary)]">
        Event not found.
      </div>
    );
  }

  const { event, latestMarket, marketHistory } = data;

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <Badge variant="outline" className="text-[10px] mb-2">
          {event.league.replace(/_/g, " ").toUpperCase()}
        </Badge>
        <h1 className="text-h1 text-[var(--text-primary)]">
          {event.homeTeam} <span className="text-[var(--text-tertiary)]">vs</span> {event.awayTeam}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {new Date(event.commenceTime).toLocaleString()}
        </p>
      </div>

      {latestMarket && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)] mb-3">Current Odds</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-xs text-[var(--text-secondary)]">{event.homeTeam}</div>
                <div className="text-lg font-mono font-semibold text-[var(--accent-gain)]">
                  {latestMarket.homeOdds.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-[var(--text-secondary)]">Draw</div>
                <div className="text-lg font-mono font-semibold text-[var(--accent-gain)]">
                  {latestMarket.drawOdds?.toFixed(2) ?? "—"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-[var(--text-secondary)]">{event.awayTeam}</div>
                <div className="text-lg font-mono font-semibold text-[var(--accent-gain)]">
                  {latestMarket.awayOdds.toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {marketHistory.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)] mb-3">Odds History</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {marketHistory.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between text-xs py-2 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <span className="text-[var(--text-tertiary)]">
                    {new Date(m.fetchedAt).toLocaleTimeString()}
                  </span>
                  <span className="font-mono text-[var(--text-primary)]">
                    {m.homeOdds.toFixed(2)} / {m.awayOdds.toFixed(2)}
                    {m.drawOdds != null ? ` / ${m.drawOdds.toFixed(2)}` : ""}
                  </span>
                  <span className="text-[var(--text-tertiary)]">{m.bookmakerKey}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
