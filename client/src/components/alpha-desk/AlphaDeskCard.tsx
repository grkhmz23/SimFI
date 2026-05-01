import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Rocket,
  Wrench,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lightbulb,
  Clock,
  Users,
  TrendingUp,
  MessageCircle,
  Tag,
  X,
} from "lucide-react";

interface AlphaDeskIdea {
  id: number;
  rank: number;
  chain: string;
  ideaType: "meme_launch" | "dev_build";
  title: string;
  name: string;
  symbol: string | null;
  narrativeThesis: string;
  whyNow: string;
  confidenceScore: string;
  riskFlags: string[];
  evidence: {
    memeTheme?: string;
    redditInspiration?: string[];
    twitterNarrative?: string;
    marketSignal?: string;
    category?: string;
    riskLevel?: string;
    targetAudience?: string;
    suggestedStack?: string[];
    complexity?: "weekend" | "sprint" | "quarter";
    monetization?: string;
    evidence?: string[];
  };
}

interface AlphaDeskCardProps {
  idea: AlphaDeskIdea;
}

function ComplexityBadge({ complexity }: { complexity?: string }) {
  const colors: Record<string, string> = {
    weekend: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    sprint: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    quarter: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        colors[complexity ?? ""] || colors.sprint
      )}
    >
      <Clock className="h-3 w-3" />
      {complexity}
    </span>
  );
}

function RiskBadge({ level }: { level?: string }) {
  const colors: Record<string, string> = {
    low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    high: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        colors[level ?? "medium"] || colors.medium
      )}
    >
      {level ?? "medium"} risk
    </span>
  );
}

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  const labels: Record<string, string> = {
    meme: "Meme",
    culture: "Culture",
    political: "Political",
    tech: "Tech",
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
      <Tag className="h-3 w-3" />
      {labels[category] ?? category}
    </span>
  );
}

function ChainBadge({ chain }: { chain: string }) {
  if (chain === "any") return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase tracking-wider",
        chain === "base"
          ? "border-blue-500/30 text-blue-400"
          : chain === "solana"
          ? "border-purple-500/30 text-purple-400"
          : "border-emerald-500/30 text-emerald-400"
      )}
    >
      {chain}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
//  Detail Modal
/* ------------------------------------------------------------------ */

function IdeaDetailDialog({
  idea,
  open,
  onClose,
}: {
  idea: AlphaDeskIdea;
  open: boolean;
  onClose: () => void;
}) {
  const isMeme = idea.ideaType === "meme_launch";
  const confidence = parseFloat(idea.confidenceScore) || 0;
  const evidence = idea.evidence || {};

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-[var(--bg-raised)] border-[var(--border-subtle)]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm font-bold",
                  isMeme
                    ? "bg-[var(--accent-premium)]/10 text-[var(--accent-premium)]"
                    : "bg-blue-500/10 text-blue-400"
                )}
              >
                {isMeme ? <Rocket className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                  {isMeme ? idea.symbol : idea.name}
                </DialogTitle>
                <p className="text-xs text-[var(--text-secondary)]">
                  {isMeme ? idea.name : idea.title}
                </p>
              </div>
            </div>
            <ChainBadge chain={idea.chain} />
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Confidence */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-secondary)]">
              <span>Confidence</span>
              <span className="font-mono">{confidence.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isMeme ? "bg-[var(--accent-premium)]" : "bg-blue-400"
                )}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>

          {/* Thesis */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              {isMeme ? "Narrative Thesis" : "Concept"}
            </p>
            <p className="text-sm italic text-[var(--text-primary)] leading-relaxed">
              {idea.narrativeThesis}
            </p>
          </div>

          {/* Why Now */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Why Now
            </p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {idea.whyNow}
            </p>
          </div>

          {/* Meme-specific detail blocks */}
          {isMeme && (
            <>
              {/* Meme Theme */}
              <div className="rounded-lg bg-[var(--bg-base)] p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-[var(--accent-premium)] font-medium">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Meme Theme
                </div>
                <p className="text-sm text-[var(--text-primary)]">
                  {evidence.memeTheme || "Viral cultural moment"}
                </p>
              </div>

              {/* Twitter Narrative */}
              {evidence.twitterNarrative && (
                <div className="rounded-lg bg-[var(--bg-base)] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-[var(--accent-premium)] font-medium">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Twitter Narrative
                  </div>
                  <p className="text-sm text-[var(--text-primary)]">
                    {evidence.twitterNarrative}
                  </p>
                </div>
              )}

              {/* Market Signal */}
              {evidence.marketSignal && (
                <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--accent-premium)] mt-0.5 shrink-0" />
                  <span>{evidence.marketSignal}</span>
                </div>
              )}

              {/* Reddit Inspiration */}
              {evidence.redditInspiration && evidence.redditInspiration.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Reddit Inspiration
                  </p>
                  <div className="space-y-1">
                    {evidence.redditInspiration.map((r, i) => (
                      <p key={i} className="text-xs text-[var(--text-secondary)]">
                        → {r}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Dev-specific detail blocks */}
          {!isMeme && (
            <>
              <div className="rounded-lg bg-blue-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs text-blue-400 font-medium">
                  <Users className="h-3.5 w-3.5" />
                  Target Audience
                </div>
                <p className="text-sm text-[var(--text-primary)]">
                  {evidence.targetAudience || "Not specified"}
                </p>

                {evidence.suggestedStack && evidence.suggestedStack.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {evidence.suggestedStack.map((tech) => (
                      <span
                        key={tech}
                        className="inline-flex rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <ComplexityBadge complexity={evidence.complexity} />
                  {evidence.monetization && (
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {evidence.monetization}
                    </span>
                  )}
                </div>
              </div>

              {/* Supporting Evidence */}
              {evidence.evidence && evidence.evidence.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Supporting Evidence
                  </p>
                  <div className="space-y-1">
                    {evidence.evidence.map((e, i) => (
                      <p key={i} className="text-xs text-[var(--text-secondary)]">
                        • {e}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Risk Flags */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Risk Assessment
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge level={evidence.riskLevel} />
              {idea.riskFlags.length > 0 ? (
                idea.riskFlags.map((flag) => (
                  <span
                    key={flag}
                    className="inline-flex rounded bg-red-500/5 px-1.5 py-0.5 text-[10px] text-red-300"
                  >
                    {flag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-[var(--text-tertiary)]">
                  No major risks flagged
                </span>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
//  Card Component
/* ------------------------------------------------------------------ */

export function AlphaDeskCard({ idea }: AlphaDeskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const isMeme = idea.ideaType === "meme_launch";
  const confidence = parseFloat(idea.confidenceScore) || 0;
  const evidence = idea.evidence || {};

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col gap-4 rounded-xl border p-5 transition-all hover:shadow-lg cursor-pointer",
          isMeme
            ? "border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[var(--accent-premium)]/30"
            : "border-blue-500/10 bg-blue-500/[0.02] hover:border-blue-500/30"
        )}
        onClick={() => setDetailOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setDetailOpen(true);
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-bold",
                isMeme
                  ? "bg-[var(--accent-premium)]/10 text-[var(--accent-premium)]"
                  : "bg-blue-500/10 text-blue-400"
              )}
            >
              {isMeme ? <Rocket className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                {isMeme ? idea.symbol : idea.name}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {isMeme ? idea.name : idea.title}
              </p>
            </div>
          </div>
          <ChainBadge chain={idea.chain} />
        </div>

        {/* Title for meme, or project title for dev */}
        {isMeme && (
          <p className="text-sm font-semibold text-[var(--text-primary)]">{idea.title}</p>
        )}

        {/* Confidence bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-[var(--text-secondary)]">
            <span>Confidence</span>
            <span className="font-mono">{confidence.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isMeme ? "bg-[var(--accent-premium)]" : "bg-blue-400"
              )}
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>

        {/* Thesis / Concept */}
        <p className="text-sm italic text-[var(--text-primary)] leading-relaxed line-clamp-3">
          {idea.narrativeThesis}
        </p>

        {/* Why now */}
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">
          {idea.whyNow}
        </p>

        {/* Meme-specific: Theme + Reddit + Twitter + Category */}
        {isMeme && (
          <div className="rounded-lg bg-[var(--bg-base)] p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-[var(--accent-premium)] font-medium">
              <Lightbulb className="h-3.5 w-3.5" />
              Meme Theme
            </div>
            <p className="text-sm text-[var(--text-primary)] line-clamp-2">
              {evidence.memeTheme || "Viral cultural moment"}
            </p>

            {evidence.twitterNarrative && (
              <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <MessageCircle className="h-3 w-3 text-[var(--accent-premium)] mt-0.5 shrink-0" />
                <span className="line-clamp-1">{evidence.twitterNarrative}</span>
              </div>
            )}

            {evidence.redditInspiration && evidence.redditInspiration.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  Reddit Inspiration
                </p>
                {evidence.redditInspiration.slice(0, expanded ? undefined : 2).map((r, i) => (
                  <p key={i} className="text-xs text-[var(--text-secondary)] truncate">
                    → {r}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <CategoryBadge category={evidence.category} />
              <RiskBadge level={evidence.riskLevel} />
            </div>
          </div>
        )}

        {/* Dev-specific: Stack + Audience + Complexity */}
        {!isMeme && (
          <div className="rounded-lg bg-blue-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-blue-400 font-medium">
              <Users className="h-3.5 w-3.5" />
              Target: {evidence.targetAudience}
            </div>
            {evidence.suggestedStack && evidence.suggestedStack.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {evidence.suggestedStack.slice(0, 4).map((tech) => (
                  <span
                    key={tech}
                    className="inline-flex rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300"
                  >
                    {tech}
                  </span>
                ))}
                {evidence.suggestedStack.length > 4 && (
                  <span className="inline-flex rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300">
                    +{evidence.suggestedStack.length - 4}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <ComplexityBadge complexity={evidence.complexity} />
              {evidence.monetization && (
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  💰 {evidence.monetization}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Evidence signals */}
        {isMeme && evidence.marketSignal && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--accent-premium)]" />
            <span className="line-clamp-1">{evidence.marketSignal}</span>
          </div>
        )}

        {!isMeme && evidence.evidence && evidence.evidence.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Supporting Evidence
            </p>
            {evidence.evidence.slice(0, expanded ? undefined : 2).map((e, i) => (
              <p key={i} className="text-xs text-[var(--text-secondary)] line-clamp-1">
                • {e}
              </p>
            ))}
          </div>
        )}

        {/* Risk / Meta row */}
        <div className="flex flex-wrap items-center gap-2 mt-auto pt-2 border-t border-[var(--border-subtle)]">
          {isMeme ? (
            <>
              {idea.riskFlags.slice(0, expanded ? undefined : 2).map((flag) => (
                <span
                  key={flag}
                  className="inline-flex rounded bg-red-500/5 px-1.5 py-0.5 text-[10px] text-red-300"
                >
                  {flag}
                </span>
              ))}
            </>
          ) : (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {idea.riskFlags.length > 0
                ? idea.riskFlags.slice(0, expanded ? undefined : 2).join(" • ")
                : "No major risks flagged"}
            </span>
          )}

          {/* Expand toggle */}
          {(isMeme
            ? (evidence.redditInspiration?.length ?? 0) + idea.riskFlags.length > 4
            : (evidence.evidence?.length ?? 0) > 2) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="ml-auto text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] flex items-center gap-0.5"
            >
              {expanded ? (
                <>
                  Less <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  More <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </div>

        {/* View full hint */}
        <div className="flex items-center justify-center pt-1">
          <span className="text-[10px] text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view full details
          </span>
        </div>
      </div>

      <IdeaDetailDialog idea={idea} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </>
  );
}
