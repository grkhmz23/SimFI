import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useChain } from "@/lib/chain-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlphaDeskCard } from "@/components/alpha-desk/AlphaDeskCard";
import { TradeModal } from "@/components/TradeModal";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp, History, Info, ChevronDown, ChevronUp } from "lucide-react";

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

interface TrackRecord {
  totalIdeas: number;
  profitablePct: number;
  medianReturn: number;
  bestCall: { token: string; return: number };
  worstCall: { token: string; return: number };
}

const easeOutExpo = [0.16, 1, 0.3, 1];

export default function AlphaDesk() {
  const [, setLocation] = useLocation();
  const { activeChain } = useChain();
  const [tradeToken, setTradeToken] = useState<{ address: string; name: string; symbol: string } | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  const { data: todayData, isLoading: todayLoading } = useQuery<{
    runDate: string;
    chain: string;
    ideas: AlphaDeskIdea[];
  }>({
    queryKey: [`/api/alpha-desk/today`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/today?chain=${activeChain}`);
      if (!res.ok) throw new Error("Failed to fetch Alpha Desk picks");
      return res.json();
    },
  });

  const { data: trackRecord } = useQuery<TrackRecord>({
    queryKey: [`/api/alpha-desk/track-record`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/track-record?chain=${activeChain}&horizon=24h`);
      if (!res.ok) throw new Error("Failed to fetch track record");
      return res.json();
    },
  });

  const { data: historyData } = useQuery<{
    history: Array<{ runDate: string; status: string; ideas: AlphaDeskIdea[] }>;
  }>({
    queryKey: [`/api/alpha-desk/history`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/history?chain=${activeChain}&days=7`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const handlePaperTrade = (tokenAddress: string, chain: string, name: string, symbol: string) => {
    setTradeToken({ address: tokenAddress, name, symbol });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: easeOutExpo }}
          className="mb-10"
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
            AI-curated memecoin signals on Base and Solana. Three high-conviction picks every day,
            backed by social momentum, on-chain liquidity trends, and developer activity.
          </p>
        </motion.div>

        {/* Today's picks */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[var(--accent-premium)]" />
            Today&apos;s Picks
          </h2>

          {todayLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-80 rounded-xl" />
              ))}
            </div>
          ) : todayData?.ideas?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {todayData.ideas.map((idea) => (
                <AlphaDeskCard
                  key={idea.id}
                  idea={idea}
                  onPaperTrade={(addr, chain) => handlePaperTrade(addr, chain, idea.name, idea.symbol)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-12 text-center">
              <Sparkles className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                No Picks Available
              </h3>
              <p className="text-[var(--text-secondary)] mb-6">
                The Alpha Desk pipeline hasn&apos;t run yet for today. Check back later or switch chains.
              </p>
              <Button onClick={() => setLocation("/trade")}>Go to Trade</Button>
            </div>
          )}
        </section>

        {/* Track record */}
        {trackRecord && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--accent-premium)]" />
              Track Record
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5">
                <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-1">Total Calls</p>
                <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">{trackRecord.totalIdeas}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5">
                <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-1">Profitable %</p>
                <p className="text-2xl font-mono font-bold text-emerald-400">{trackRecord.profitablePct}%</p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5">
                <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-1">Median Return</p>
                <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">
                  {trackRecord.medianReturn >= 0 ? "+" : ""}
                  {trackRecord.medianReturn}%
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5">
                <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-1">Best Call</p>
                <p className="text-2xl font-mono font-bold text-emerald-400">
                  +{trackRecord.bestCall.return}%
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">{trackRecord.bestCall.token}</p>
              </div>
            </div>
          </section>
        )}

        {/* History */}
        {historyData?.history?.length ? (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--accent-premium)]" />
              Recent History
            </h2>
            <div className="space-y-3">
              {historyData.history.map((day) => (
                <div
                  key={day.runDate}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-mono text-[var(--text-secondary)]">{day.runDate}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">{day.ideas.length} picks</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {day.ideas.map((idea) => {
                      const outcome = idea.outcomes?.find((o) => o.horizon === "24h");
                      const pct = outcome?.pctChange ? parseFloat(outcome.pctChange) : 0;
                      return (
                        <div
                          key={idea.id}
                          className="flex items-center gap-2 rounded-lg bg-[var(--bg-base)] px-3 py-2"
                        >
                          <span className="text-sm font-bold text-[var(--text-primary)]">{idea.symbol}</span>
                          <span
                            className={`text-xs font-mono ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                          >
                            {pct >= 0 ? "+" : ""}
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Methodology */}
        <section>
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
                We track social momentum, developer activity, on-chain liquidity trends, and token age.
                Our AI agent weighs these signals, clusters the strongest candidates, and surfaces the
                top three each day.
              </p>
              <ul className="list-disc list-inside space-y-1 text-[var(--text-tertiary)]">
                <li>Social signals from Twitter/X (mentions, engagement, unique authors)</li>
                <li>Developer activity from GitHub (commits, contributors, releases)</li>
                <li>On-chain metrics from DexScreener (volume, liquidity, price momentum)</li>
                <li>Novelty bonus for newer tokens (decaying over 60 days)</li>
                <li>Hype-only penalty when &gt;80% of social signals are pure hype</li>
              </ul>
            </motion.div>
          )}
        </section>
      </div>

      {/* Trade Modal */}
      {tradeToken && (
        <TradeModal
          token={{ tokenAddress: tradeToken.address, name: tradeToken.name, symbol: tradeToken.symbol, price: 0, marketCap: 0 }}
          mode="buy"
          onClose={() => setTradeToken(null)}
        />
      )}
    </div>
  );
}
