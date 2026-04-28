import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useChain } from "@/lib/chain-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlphaDeskCard } from "@/components/alpha-desk/AlphaDeskCard";
import { motion } from "framer-motion";
import {
  Rocket,
  Wrench,
  Sparkles,
  History,
  Info,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Activity,
  Calendar,
  ThumbsUp,
  Plus,
  Flame,
  MessageSquare,
  Trash2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

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
  evidence: Record<string, any>;
}

interface TodayData {
  runDate: string;
  chain: string;
  memeIdeas: AlphaDeskIdea[];
  devIdeas: AlphaDeskIdea[];
}

interface HorizonStat {
  horizon: "1h" | "6h" | "24h" | "7d";
  totalTracked: number;
  profitableCount: number;
  hitRate: number;
  avgReturn: number;
  medianReturn: number;
  bestReturn: number;
  worstReturn: number;
}

interface PickOutcome {
  horizon: string;
  priceUsd: string | null;
  pctChange: string | null;
  measuredAt: string;
}

interface PerformancePick {
  id: number;
  runDate: string;
  symbol: string | null;
  name: string;
  chain: string;
  ideaType: string;
  confidenceScore: string;
  priceAtPublishUsd: string | null;
  publishedAt: string;
  outcomes: PickOutcome[];
}

interface PerformanceData {
  chain: string;
  totalIdeas: number;
  ideasWithOutcomes: number;
  horizonStats: HorizonStat[];
  bestPick: { symbol: string | null; name: string; return: number; horizon: string } | null;
  worstPick: { symbol: string | null; name: string; return: number; horizon: string } | null;
  picks: PerformancePick[];
}

interface CommunityPick {
  id: string;
  userId: string;
  chain: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  reason: string | null;
  voteCount: number;
  createdAt: string;
  username: string;
  hasVoted?: boolean;
}

const easeOutExpo = [0.16, 1, 0.3, 1];
const HORIZON_COLORS = {
  "1h": "#8b5cf6",
  "6h": "#6366f1",
  "24h": "#14F195",
  "7d": "#3b82f6",
};

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

function formatPct(val: number): string {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function formatUsd(val: number): string {
  if (val >= 1) return `$${val.toFixed(4)}`;
  if (val >= 0.01) return `$${val.toFixed(6)}`;
  return `$${val.toFixed(8)}`;
}

function horizonLabel(h: string): string {
  return h === "1h" ? "1 Hour" : h === "6h" ? "6 Hours" : h === "24h" ? "24 Hours" : "7 Days";
}

/* ------------------------------------------------------------------ */
//  Sub-components
/* ------------------------------------------------------------------ */

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all
        ${active
          ? "bg-[var(--accent-premium)]/10 text-[var(--accent-premium)] border border-[var(--accent-premium)]/20"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] border border-transparent"
        }
      `}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}15` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-semibold">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-tertiary)] mt-1">{sub}</p>}
    </div>
  );
}

function PerformanceView({ data, isLoading }: { data?: PerformanceData; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!data || data.ideasWithOutcomes === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-12 text-center">
        <Activity className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">No Performance Data Yet</h3>
        <p className="text-[var(--text-secondary)] max-w-md mx-auto">
          Outcomes are measured after Alpha Desk picks are published. Check back once the tracking pipeline has recorded price movements at 1h, 6h, 24h, and 7d horizons.
        </p>
      </div>
    );
  }

  const stat24h = data.horizonStats.find((s) => s.horizon === "24h");

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Hit Rate (24h)"
          value={`${stat24h?.hitRate ?? 0}%`}
          sub={`${stat24h?.profitableCount ?? 0} / ${stat24h?.totalTracked ?? 0} profitable`}
          icon={Target}
          color="#14F195"
        />
        <SummaryCard
          label="Avg Return (24h)"
          value={formatPct(stat24h?.avgReturn ?? 0)}
          sub={`Median: ${formatPct(stat24h?.medianReturn ?? 0)}`}
          icon={Activity}
          color="#6366f1"
        />
        <SummaryCard
          label="Total Picks Tracked"
          value={String(data.ideasWithOutcomes)}
          sub={`${data.totalIdeas} total ideas generated`}
          icon={BarChart3}
          color="#8b5cf6"
        />
        <SummaryCard
          label="Best Pick"
          value={data.bestPick ? `${formatPct(data.bestPick.return)}` : "—"}
          sub={data.bestPick ? `${data.bestPick.symbol ?? data.bestPick.name} @ ${horizonLabel(data.bestPick.horizon)}` : "No data"}
          icon={TrendingUp}
          color="#14F195"
        />
      </div>

      {/* Hit Rate by Horizon Chart */}
      {data.horizonStats.some((s) => s.totalTracked > 0) && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-6 flex items-center gap-2">
            <Target className="h-4 w-4 text-[var(--accent-premium)]" />
            Hit Rate by Horizon
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.horizonStats} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.3} />
                <XAxis
                  dataKey="horizon"
                  tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--border-subtle)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                  labelStyle={{ color: "var(--text-primary)" }}
                  itemStyle={{ color: "var(--text-secondary)" }}
                  formatter={(value: number) => [`${value}%`, "Hit Rate"]}
                />
                <Bar dataKey="hitRate" radius={[6, 6, 0, 0]} maxBarSize={60}>
                  {data.horizonStats.map((entry) => (
                    <Cell key={entry.horizon} fill={HORIZON_COLORS[entry.horizon]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {data.horizonStats.map((s) => (
              <div key={s.horizon} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: HORIZON_COLORS[s.horizon] }} />
                {horizonLabel(s.horizon)} — {s.totalTracked} tracked
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Picks Table */}
      {data.picks.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] overflow-hidden">
          <div className="p-5 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--accent-premium)]" />
              Tracked Picks
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-5 py-3 text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    Token
                  </th>
                  <th className="text-right px-5 py-3 text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    Published
                  </th>
                  <th className="text-right px-5 py-3 text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    Price @ Publish
                  </th>
                  <th className="text-right px-5 py-3 text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    1h
                  </th>
                  <th className="text-right px-5 py-3 text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    6h
                  </th>
                  <th className="text-right px-5 py-3 text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    24h
                  </th>
                  <th className="text-right px-5 py-3 text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">
                    7d
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.picks.map((pick) => {
                  const getOutcome = (h: string) => pick.outcomes.find((o) => o.horizon === h);
                  const o1h = getOutcome("1h");
                  const o6h = getOutcome("6h");
                  const o24h = getOutcome("24h");
                  const o7d = getOutcome("7d");

                  return (
                    <tr
                      key={pick.id}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-base)]/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">
                            {pick.symbol ?? "—"}
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)] truncate max-w-[160px]">
                            {pick.name}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-[var(--text-secondary)] whitespace-nowrap">
                        {new Date(pick.publishedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[var(--text-secondary)]">
                        {pick.priceAtPublishUsd
                          ? formatUsd(parseFloat(pick.priceAtPublishUsd))
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <OutcomeBadge outcome={o1h} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <OutcomeBadge outcome={o6h} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <OutcomeBadge outcome={o24h} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <OutcomeBadge outcome={o7d} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome?: PickOutcome }) {
  if (!outcome || outcome.pctChange == null) {
    return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  }
  const pct = parseFloat(outcome.pctChange);
  const isGain = pct >= 0;
  return (
    <Badge
      variant="outline"
      className={`text-xs font-mono ${
        isGain
          ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
          : "border-red-500/30 text-red-400 bg-red-500/5"
      }`}
    >
      {isGain ? "+" : ""}
      {pct.toFixed(1)}%
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
//  Community Picks View
/* ------------------------------------------------------------------ */

function CommunityPicksView({ chain }: { chain: string }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<"votes" | "new">("votes");
  const [showSubmit, setShowSubmit] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [reason, setReason] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const { data, isLoading } = useQuery<{ picks: CommunityPick[] }>({
    queryKey: [`/api/community-picks`, chain, sortBy],
    queryFn: async () => {
      const res = await fetch(`/api/community-picks?chain=${chain}&sort=${sortBy}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch community picks");
      return res.json();
    },
  });

  const voteMutation = useMutation({
    mutationFn: async ({ pickId, action }: { pickId: string; action: "vote" | "unvote" }) => {
      const res = await fetch(`/api/community-picks/${pickId}/vote`, {
        method: action === "vote" ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Vote failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/community-picks`] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/community-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chain,
          tokenAddress,
          tokenName,
          tokenSymbol,
          reason: reason || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit pick");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/community-picks`] });
      setShowSubmit(false);
      setTokenAddress("");
      setTokenName("");
      setTokenSymbol("");
      setReason("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pickId: string) => {
      const res = await fetch(`/api/community-picks/${pickId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete pick");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/community-picks`] });
    },
  });

  const resolveToken = async () => {
    if (!tokenAddress.trim()) return;
    setIsResolving(true);
    try {
      const res = await fetch(`/api/market/token/${tokenAddress}?chain=${chain}`);
      if (res.ok) {
        const data = await res.json();
        if (data.name) setTokenName(data.name);
        if (data.symbol) setTokenSymbol(data.symbol);
      }
    } catch {
      // ignore
    } finally {
      setIsResolving(false);
    }
  };

  const picks = data?.picks ?? [];

  return (
    <div className="space-y-6">
      {/* Header + Submit toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
            <Flame className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Community Picks</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Tokens the community is watching — vote on what looks hot
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] overflow-hidden">
            <button
              onClick={() => setSortBy("votes")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                sortBy === "votes"
                  ? "bg-[var(--accent-premium)]/10 text-[var(--accent-premium)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Trending
            </button>
            <button
              onClick={() => setSortBy("new")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                sortBy === "new"
                  ? "bg-[var(--accent-premium)]/10 text-[var(--accent-premium)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              New
            </button>
          </div>
          {isAuthenticated && (
            <Button
              size="sm"
              onClick={() => setShowSubmit(!showSubmit)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Submit Pick
            </Button>
          )}
        </div>
      </div>

      {/* Submit Form */}
      {showSubmit && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Submit a Community Pick</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">Token Address</label>
              <div className="flex gap-2">
                <Input
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  placeholder={`Enter ${chain} token address...`}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resolveToken}
                  disabled={isResolving || !tokenAddress.trim()}
                >
                  {isResolving ? "..." : "Lookup"}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">Symbol</label>
              <Input
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value)}
                placeholder="TKN"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">Token Name</label>
            <Input
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="Token Name"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">
              Why this token? (optional)
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Share your thesis..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowSubmit(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => submitMutation.mutate()}
              disabled={
                submitMutation.isPending ||
                !tokenAddress.trim() ||
                !tokenName.trim() ||
                !tokenSymbol.trim()
              }
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Pick"}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Not authenticated message */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-6 text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-[var(--text-tertiary)] mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">
            Sign in to submit picks and vote on community tokens
          </p>
        </div>
      )}

      {/* Picks Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-12 text-center">
          <Flame className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">No Community Picks Yet</h3>
          <p className="text-[var(--text-secondary)]">
            Be the first to share a token the community should watch. Submit a pick above!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {picks.map((pick) => (
            <div
              key={pick.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">${pick.tokenSymbol}</h3>
                  <p className="text-xs text-[var(--text-secondary)]">{pick.tokenName}</p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {pick.chain}
                </Badge>
              </div>

              {pick.reason && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                  "{pick.reason}"
                </p>
              )}

              <div className="flex items-center justify-between mt-auto pt-3 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-tertiary)]">by {pick.username}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {new Date(pick.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {user?.id === pick.userId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-[var(--text-tertiary)] hover:text-red-400"
                      onClick={() => deleteMutation.mutate(pick.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isAuthenticated && (
                    <Button
                      variant={pick.hasVoted ? "default" : "outline"}
                      size="sm"
                      className={`h-7 gap-1.5 text-xs ${
                        pick.hasVoted
                          ? "bg-[var(--accent-premium)]/10 text-[var(--accent-premium)] border-[var(--accent-premium)]/30 hover:bg-[var(--accent-premium)]/20"
                          : ""
                      }`}
                      onClick={() =>
                        voteMutation.mutate({
                          pickId: pick.id,
                          action: pick.hasVoted ? "unvote" : "vote",
                        })
                      }
                      disabled={voteMutation.isPending}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {pick.voteCount}
                    </Button>
                  )}
                  {!isAuthenticated && (
                    <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {pick.voteCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
//  Main Page
/* ------------------------------------------------------------------ */

export default function AlphaDesk() {
  const [, setLocation] = useLocation();
  const { activeChain } = useChain();
  const [activeTab, setActiveTab] = useState<"picks" | "history" | "performance" | "community">("picks");
  const [showMethodology, setShowMethodology] = useState(false);

  const { data: todayData, isLoading: todayLoading } = useQuery<TodayData>({
    queryKey: [`/api/alpha-desk/today`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/today?chain=${activeChain}`);
      if (!res.ok) throw new Error("Failed to fetch Alpha Desk picks");
      return res.json();
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{
    history: Array<{ runDate: string; status: string; ideas: AlphaDeskIdea[] }>;
  }>({
    queryKey: [`/api/alpha-desk/history`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/history?chain=${activeChain}&days=7`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const { data: perfData, isLoading: perfLoading } = useQuery<PerformanceData>({
    queryKey: [`/api/alpha-desk/performance`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/performance?chain=${activeChain}`);
      if (!res.ok) throw new Error("Failed to fetch performance");
      return res.json();
    },
    enabled: activeTab === "performance",
  });

  const hasMemes = (todayData?.memeIdeas?.length ?? 0) > 0;
  const hasDevs = (todayData?.devIdeas?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: easeOutExpo }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-premium)]/10">
              <Sparkles className="h-5 w-5 text-[var(--accent-premium)]" />
            </div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
              Alpha Desk
            </h1>
          </div>
          <p className="text-[var(--text-secondary)] max-w-2xl">
            AI-generated daily signals for traders and builders. Meme token picks for day traders
            and onchain project ideas for developers — powered by Reddit, Twitter, GitHub, and on-chain signals.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8">
          <TabButton
            active={activeTab === "picks"}
            onClick={() => setActiveTab("picks")}
            icon={Rocket}
            label="Today's Picks"
          />
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            icon={History}
            label="History"
          />
          <TabButton
            active={activeTab === "performance"}
            onClick={() => setActiveTab("performance")}
            icon={BarChart3}
            label="Performance"
          />
          <TabButton
            active={activeTab === "community"}
            onClick={() => setActiveTab("community")}
            icon={Flame}
            label="Community"
          />
        </div>

        {/* ── Today's Picks Tab ── */}
        {activeTab === "picks" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-10"
          >
            {/* Meme Launch Ideas */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Rocket className="h-5 w-5 text-[var(--accent-premium)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Daily Meme Picks for Day Traders
                </h2>
                <span className="text-xs text-[var(--text-tertiary)] ml-2">
                  Viral token concepts backed by social momentum
                </span>
              </div>

              {todayLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-96 rounded-xl" />
                  ))}
                </div>
              ) : hasMemes ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {todayData!.memeIdeas.map((idea) => (
                    <AlphaDeskCard key={idea.id} idea={idea} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-12 text-center">
                  <Rocket className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                    No Launch Ideas Yet
                  </h3>
                  <p className="text-[var(--text-secondary)] mb-6">
                    The Alpha Desk pipeline hasn&apos;t run yet for today. Check back later — fresh meme and build ideas are generated daily.
                  </p>
                  <Button onClick={() => setLocation("/trade")}>Go to Trade</Button>
                </div>
              )}
            </section>

            {/* Dev Build Ideas */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Wrench className="h-5 w-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Onchain Build Ideas for Developers
                </h2>
                <span className="text-xs text-[var(--text-tertiary)] ml-2">
                  Project concepts for onchain builders
                </span>
              </div>

              {todayLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-96 rounded-xl" />
                  ))}
                </div>
              ) : hasDevs ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {todayData!.devIdeas.map((idea) => (
                    <AlphaDeskCard key={idea.id} idea={idea} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-blue-500/10 bg-blue-500/[0.02] p-12 text-center">
                  <Wrench className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                    No Build Ideas Yet
                  </h3>
                  <p className="text-[var(--text-secondary)] mb-6">
                    The pipeline hasn&apos;t generated developer ideas for today. Check back later.
                  </p>
                </div>
              )}
            </section>
          </motion.div>
        )}

        {/* ── History Tab ── */}
        {activeTab === "history" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {historyLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : historyData?.history?.length ? (
              <div className="space-y-3">
                {historyData.history.map((day) => {
                  const memes = day.ideas.filter((i) => i.ideaType === "meme_launch");
                  const devs = day.ideas.filter((i) => i.ideaType === "dev_build");
                  return (
                    <div
                      key={day.runDate}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-mono text-[var(--text-secondary)]">
                          {day.runDate}
                        </span>
                        <div className="flex gap-3 text-xs text-[var(--text-tertiary)]">
                          <span className="flex items-center gap-1">
                            <Rocket className="h-3 w-3" /> {memes.length} launch
                          </span>
                          <span className="flex items-center gap-1">
                            <Wrench className="h-3 w-3" /> {devs.length} build
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {memes.map((idea) => (
                          <span
                            key={idea.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-base)] px-2 py-1 text-xs text-[var(--text-primary)]"
                          >
                            <Rocket className="h-3 w-3 text-[var(--accent-premium)]" />
                            {idea.symbol ?? idea.name}
                          </span>
                        ))}
                        {devs.map((idea) => (
                          <span
                            key={idea.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-500/5 px-2 py-1 text-xs text-blue-300"
                          >
                            <Wrench className="h-3 w-3" />
                            {idea.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">No History Yet</h3>
                <p className="text-[var(--text-secondary)]">
                  Past Alpha Desk runs will appear here once the pipeline starts generating daily picks.
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Performance Tab ── */}
        {activeTab === "performance" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <PerformanceView data={perfData} isLoading={perfLoading} />
          </motion.div>
        )}

        {/* ── Community Tab ── */}
        {activeTab === "community" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CommunityPicksView chain={activeChain} />
          </motion.div>
        )}

        {/* Methodology */}
        <section className="mt-12">
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-3"
          >
            <Info className="h-4 w-4" />
            Methodology
            {showMethodology ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showMethodology && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5 text-sm text-[var(--text-secondary)] leading-relaxed"
            >
              <p className="mb-3">
                Alpha Desk runs two parallel AI pipelines every day at 13:00 UTC:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-[var(--accent-premium)]" />
                    Launch Ideas
                  </p>
                  <ul className="list-disc list-inside text-[var(--text-tertiary)] text-xs space-y-1">
                    <li>Reddit hot posts from r/memecoins, r/wallstreetbets, r/CryptoCurrency</li>
                    <li>Twitter/X viral narratives and hashtag trends</li>
                    <li>On-chain volume and liquidity momentum</li>
                    <li>Current news and cultural moments</li>
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-blue-400" />
                    Build Ideas
                  </p>
                  <ul className="list-disc list-inside text-[var(--text-tertiary)] text-xs space-y-1">
                    <li>GitHub developer activity and trending repos</li>
                    <li>Market gaps identified from on-chain data</li>
                    <li>Developer complaints and feature requests on Twitter/Reddit</li>
                    <li>Emerging narrative trends with no product yet</li>
                  </ul>
                </div>
              </div>
              <p className="text-[var(--text-tertiary)] text-xs">
                All ideas are generated by Moonshot/OpenRouter LLMs and stored with source attribution.
                No financial advice — these are creative concepts, not investment recommendations.
              </p>
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}
