import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useChain } from "@/lib/chain-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlphaDeskCard } from "@/components/alpha-desk/AlphaDeskCard";
import { motion } from "framer-motion";
import { Rocket, Wrench, Sparkles, History, Info, ChevronDown, ChevronUp } from "lucide-react";

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

const easeOutExpo = [0.16, 1, 0.3, 1];

export default function AlphaDesk() {
  const [, setLocation] = useLocation();
  const { activeChain } = useChain();
  const [showMethodology, setShowMethodology] = useState(false);

  const { data: todayData, isLoading: todayLoading } = useQuery<TodayData>({
    queryKey: [`/api/alpha-desk/today`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/today?chain=${activeChain}`);
      if (!res.ok) throw new Error("Failed to fetch Alpha Desk picks");
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
            AI-generated daily ideation for blockchain creators. Meme token concepts for launchers
            and project ideas for developers — powered by Reddit, Twitter, GitHub, and on-chain signals.
          </p>
        </motion.div>

        {/* Meme Launch Ideas */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="h-5 w-5 text-[var(--accent-premium)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Today's Launch Ideas
            </h2>
            <span className="text-xs text-[var(--text-tertiary)] ml-2">
              Meme token concepts for creators
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
                The Alpha Desk pipeline hasn&apos;t run yet for today. Check back later or switch chains.
              </p>
              <Button onClick={() => setLocation("/trade")}>Go to Trade</Button>
            </div>
          )}
        </section>

        {/* Dev Build Ideas */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Build Ideas for Developers
            </h2>
            <span className="text-xs text-[var(--text-tertiary)] ml-2">
              Project concepts for builders
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

        {/* History */}
        {historyData?.history?.length ? (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--accent-premium)]" />
              Recent History
            </h2>
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
