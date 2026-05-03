import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPct, formatUsd, formatCount } from "@/lib/format";
import type { GammaMarket } from "@/lib/predictionApi";
import { Calendar, TrendingUp, Droplets } from "lucide-react";

interface PredictionMarketCardProps {
  market: GammaMarket;
}

export function PredictionMarketCard({ market }: PredictionMarketCardProps) {
  const yesPrice = market.outcomePrices[0] ?? 0;
  const noPrice = market.outcomePrices[1] ?? 0;
  const yesPct = yesPrice * 100;

  return (
    <Link href={`/predictions/${market.slug}`}>
      <Card className="cursor-pointer hover:border-[var(--border-strong)] transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-[var(--text-primary)] leading-snug line-clamp-2">
                {market.question}
              </h3>
              <div className="flex items-center gap-3 mt-2">
                {market.endDate && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                    <Calendar className="h-3 w-3" />
                    {new Date(market.endDate).toLocaleDateString()}
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
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge variant={yesPct >= 50 ? "default" : "secondary"} className="font-mono text-xs">
                {yesPct.toFixed(1)}% YES
              </Badge>
              <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                {formatPct((yesPrice - 0.5) * 100)}
              </span>
            </div>
          </div>

          {/* Probability bar */}
          <div className="mt-3 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent-gain)]"
              style={{ width: `${yesPct}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
