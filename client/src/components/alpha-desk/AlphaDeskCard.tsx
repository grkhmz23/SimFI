import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChain } from "@/lib/chain-context";
import { formatUsd, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles } from "lucide-react";

interface AlphaDeskIdea {
  id: number;
  rank: number;
  chain: string;
  symbol: string;
  name: string;
  narrativeThesis: string;
  whyNow: string;
  confidenceScore: string;
  riskFlags: string[];
  priceAtPublishUsd: string | null;
  tokenAddress: string;
  outcomes?: Array<{
    horizon: string;
    priceUsd: string | null;
    pctChange: string | null;
  }>;
}

interface AlphaDeskCardProps {
  idea: AlphaDeskIdea;
  onPaperTrade?: (tokenAddress: string, chain: string) => void;
  compact?: boolean;
}

export function AlphaDeskCard({ idea, onPaperTrade, compact }: AlphaDeskCardProps) {
  const { setActiveChain } = useChain();
  const [expanded, setExpanded] = useState(false);

  const confidence = parseFloat(idea.confidenceScore) || 0;
  const outcome24h = idea.outcomes?.find((o) => o.horizon === "24h");
  const pctChange = outcome24h?.pctChange ? parseFloat(outcome24h.pctChange) : undefined;
  const currentPrice = outcome24h?.priceUsd ? parseFloat(outcome24h.priceUsd) : undefined;
  const publishPrice = idea.priceAtPublishUsd ? parseFloat(idea.priceAtPublishUsd) : undefined;

  const riskColor = (flag: string) => {
    const lower = flag.toLowerCase();
    if (lower.includes("high") || lower.includes("concentrated") || lower.includes("new")) return "bg-red-500/10 text-red-400 border-red-500/20";
    if (lower.includes("medium") || lower.includes("low liquidity")) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  };

  return (
    <div className="group relative flex flex-col gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5 transition-all hover:border-[var(--border-strong)] hover:shadow-lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-premium)]/10 text-[var(--accent-premium)] font-mono text-sm font-bold">
            {idea.rank}
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
              {idea.symbol}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">{idea.name}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase tracking-wider",
            idea.chain === "base"
              ? "border-blue-500/30 text-blue-400"
              : "border-purple-500/30 text-purple-400"
          )}
        >
          {idea.chain}
        </Badge>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-[var(--text-secondary)]">
          <span>Confidence</span>
          <span className="font-mono">{confidence.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent-premium)] transition-all"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {/* Thesis */}
      <p className="text-sm font-serif italic text-[var(--text-primary)] leading-relaxed">
        {idea.narrativeThesis}
      </p>

      {/* Why now */}
      {!compact && (
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{idea.whyNow}</p>
      )}

      {/* Price performance */}
      {publishPrice != null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-[var(--text-secondary)]">
            {formatUsd(publishPrice)}
          </span>
          <ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" />
          <span className="font-mono text-[var(--text-primary)]">
            {currentPrice != null ? formatUsd(currentPrice) : "—"}
          </span>
          {pctChange != null && (
            <span
              className={cn(
                "font-mono text-xs",
                pctChange >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              ({formatPct(pctChange)})
            </span>
          )}
        </div>
      )}

      {/* Risk flags */}
      <div className="flex flex-wrap gap-1.5">
        {idea.riskFlags.slice(0, expanded ? undefined : 3).map((flag) => (
          <span
            key={flag}
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              riskColor(flag)
            )}
          >
            {flag}
          </span>
        ))}
        {idea.riskFlags.length > 3 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            +{idea.riskFlags.length - 3} more
          </button>
        )}
      </div>

      {/* CTA */}
      {onPaperTrade && (
        <Button
          className="w-full gap-2 mt-auto"
          onClick={() => {
            setActiveChain(idea.chain as "base" | "solana");
            onPaperTrade(idea.tokenAddress, idea.chain);
          }}
        >
          <Sparkles className="h-4 w-4" />
          Paper Trade
        </Button>
      )}
    </div>
  );
}
