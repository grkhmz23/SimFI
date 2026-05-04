import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChainChip } from "@/components/ui/chain-chip"
import { useAuth } from "@/lib/auth-context"
import { useChain } from "@/lib/chain-context"
import { formatUsdText, formatPct, formatCount } from "@/lib/format"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  ArrowRight,
  TrendingUp,
  Shield,
  BarChart3,
  Trophy,
  Sparkles,
  Brain,
  Activity,
  Users,
  Zap,
} from "lucide-react"

interface LeaderboardEntry {
  id: string
  username: string
  walletAddress?: string
  periodProfit?: string
  totalProfit?: string
  rank?: number
}

interface PlatformStats {
  totalUsers: number
  totalTrades: number
  totalPredictionTrades: number
  activePredictionMarkets: number
  timestamp: number
}

interface Token {
  tokenAddress: string
  name: string
  symbol: string
  priceUsd?: number
  price?: number
  priceChange24h?: number
  marketCap?: number
  volume24h?: number
  icon?: string
  chain?: string
}

interface PredictionMarket {
  conditionId: string
  slug: string
  question: string
  endDate: string | null
  active: boolean
  outcomePrices: number[]
  volume24hr: number
  liquidity: number
}

const easeOutExpo = [0.16, 1, 0.3, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: easeOutExpo },
  }),
}

// ---------------------------------------------------------------------------
// Platform Stats Bar
// ---------------------------------------------------------------------------

function StatsBar() {
  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
    queryFn: async () => {
      const res = await fetch("/api/platform/stats")
      if (!res.ok) throw new Error("Failed to fetch stats")
      return res.json()
    },
    staleTime: 60_000,
  })

  if (!stats) return null

  return (
    <motion.div
      custom={4}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="flex flex-wrap items-center gap-4 md:gap-8 mt-10"
    >
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <span className="text-sm font-mono text-[var(--text-primary)]">{formatCount(stats.totalUsers)}</span>
        <span className="text-xs text-[var(--text-tertiary)]">traders</span>
      </div>
      <div className="h-4 w-px bg-[var(--border-subtle)] hidden md:block" />
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <span className="text-sm font-mono text-[var(--text-primary)]">{formatCount(stats.totalTrades)}</span>
        <span className="text-xs text-[var(--text-tertiary)]">trades</span>
      </div>
      <div className="h-4 w-px bg-[var(--border-subtle)] hidden md:block" />
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <span className="text-sm font-mono text-[var(--text-primary)]">{formatCount(stats.activePredictionMarkets)}</span>
        <span className="text-xs text-[var(--text-tertiary)]">live markets</span>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Quick Actions Grid
// ---------------------------------------------------------------------------

function QuickActions() {
  const [, setLocation] = useLocation()
  const { isAuthenticated } = useAuth()

  const actions = [
    {
      label: "Trade Memecoins",
      desc: "Browse trending tokens on Solana & Base",
      icon: TrendingUp,
      path: "/trending",
      color: "text-[var(--accent-gain)]",
      bg: "bg-[rgba(63,168,118,0.1)]",
      border: "border-[rgba(63,168,118,0.15)]",
    },
    {
      label: "Predictions",
      desc: "Trade on real-world events with paper USD",
      icon: Brain,
      path: "/predictions",
      color: "text-[var(--accent-premium)]",
      bg: "bg-[rgba(201,169,110,0.1)]",
      border: "border-[rgba(201,169,110,0.15)]",
    },
    {
      label: "Alpha Desk",
      desc: "AI-curated daily token signals",
      icon: Sparkles,
      path: "/alpha-desk",
      color: "text-[var(--accent-premium)]",
      bg: "bg-[rgba(201,169,110,0.1)]",
      border: "border-[rgba(201,169,110,0.15)]",
    },
    {
      label: "Leaderboard",
      desc: "Compete in 6-hour ranked periods",
      icon: Trophy,
      path: "/leaderboard",
      color: "text-[var(--accent-loss)]",
      bg: "bg-[rgba(194,77,77,0.1)]",
      border: "border-[rgba(194,77,77,0.15)]",
    },
  ]

  return (
    <section className="py-12 border-t border-[var(--border-subtle)]">
      <div className="mx-auto max-w-content px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {actions.map((action, i) => (
            <motion.button
              key={action.label}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              onClick={() => setLocation(action.path)}
              className="flex flex-col items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5 text-left transition-all hover:border-[var(--border-strong)] hover:shadow-lg"
            >
              <div className={`h-10 w-10 rounded-md ${action.bg} border ${action.border} flex items-center justify-center`}>
                <action.icon className={`h-5 w-5 ${action.color}`} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[var(--text-primary)]">{action.label}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{action.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Trending Tokens Preview
// ---------------------------------------------------------------------------

function TrendingPreview() {
  const [, setLocation] = useLocation()
  const { activeChain } = useChain()

  const { data, isLoading } = useQuery<{ trending?: Token[] }>({
    queryKey: [`/api/market/trending-preview`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/market/trending?chain=${activeChain}&limit=5`)
      if (!res.ok) throw new Error("Failed to fetch trending")
      return res.json()
    },
  })

  const tokens = data?.trending?.slice(0, 5) || []

  return (
    <section className="py-12 border-t border-[var(--border-subtle)]">
      <div className="mx-auto max-w-content px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--accent-gain)]" strokeWidth={1.5} />
            <h2 className="text-h2">Trending Tokens</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/trending")}>
            View All
            <ArrowRight className="h-4 w-4 ml-1" strokeWidth={1.5} />
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-[var(--bg-raised)] animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && tokens.length > 0 && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] overflow-hidden">
            {tokens.map((token, i) => (
              <button
                key={token.tokenAddress}
                onClick={() => setLocation(`/token/${token.tokenAddress}`)}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)] border-b border-[var(--border-subtle)] last:border-0"
              >
                <span className="text-xs font-mono text-[var(--text-tertiary)] w-4">{i + 1}</span>
                {token.icon ? (
                  <img src={token.icon} alt={token.symbol} className="h-8 w-8 rounded-md object-cover shrink-0" loading="lazy" />
                ) : (
                  <div className="h-8 w-8 rounded-md bg-[var(--bg-base)] flex items-center justify-center text-[10px] font-bold text-[var(--text-tertiary)] shrink-0">
                    {token.symbol?.slice(0, 2) || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">{token.name}</span>
                    <span className="text-xs text-[var(--text-tertiary)] shrink-0">{token.symbol}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-[var(--text-primary)]">
                    {token.priceUsd !== undefined ? formatUsdText(token.priceUsd) : "—"}
                  </p>
                  {token.priceChange24h !== undefined && (
                    <p className={`text-xs font-mono ${token.priceChange24h >= 0 ? "text-[var(--accent-gain)]" : "text-[var(--accent-loss)]"}`}>
                      {formatPct(token.priceChange24h)}
                    </p>
                  )}
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" strokeWidth={1.5} />
              </button>
            ))}
          </div>
        )}

        {!isLoading && tokens.length === 0 && (
          <p className="text-sm text-[var(--text-tertiary)]">No trending tokens available.</p>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Active Predictions Preview
// ---------------------------------------------------------------------------

function PredictionsPreview() {
  const [, setLocation] = useLocation()

  const { data, isLoading } = useQuery<{ markets?: PredictionMarket[] }>({
    queryKey: ["/api/predictions/markets-preview"],
    queryFn: async () => {
      const res = await fetch("/api/predictions/markets?limit=4&offset=0")
      if (!res.ok) throw new Error("Failed to fetch predictions")
      return res.json()
    },
  })

  const markets = data?.markets?.slice(0, 4) || []

  return (
    <section className="py-12 border-t border-[var(--border-subtle)]">
      <div className="mx-auto max-w-content px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
            <h2 className="text-h2">Active Predictions</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/predictions")}>
            Browse All
            <ArrowRight className="h-4 w-4 ml-1" strokeWidth={1.5} />
          </Button>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-[var(--bg-raised)] animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && markets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {markets.map((market) => {
              const yesPrice = market.outcomePrices[0] ?? 0
              const yesPct = yesPrice * 100
              return (
                <button
                  key={market.conditionId}
                  onClick={() => setLocation(`/predictions/${market.slug}`)}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5 text-left transition-all hover:border-[var(--border-strong)] hover:shadow-lg"
                >
                  <h3 className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">{market.question}</h3>
                  <div className="mt-auto">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-[var(--text-tertiary)]">YES {yesPct.toFixed(1)}%</span>
                      <span className="text-xs text-[var(--text-tertiary)]">NO {(100 - yesPct).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden flex">
                      <div className="h-full rounded-full bg-[var(--accent-gain)]" style={{ width: `${yesPct}%` }} />
                      <div className="h-full rounded-full bg-[var(--accent-loss)]" style={{ width: `${100 - yesPct}%` }} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {!isLoading && markets.length === 0 && (
          <p className="text-sm text-[var(--text-tertiary)]">No active prediction markets.</p>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Leaderboard Section
// ---------------------------------------------------------------------------

function LeaderboardSection() {
  const [, setLocation] = useLocation()
  const { activeChain } = useChain()

  const { data: leaderboardData } = useQuery<{
    leaders: LeaderboardEntry[]
    periodStart: string
    periodEnd: string
  }>({
    queryKey: ["/api/leaderboard/current-period", activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard/current-period?chain=${activeChain}`)
      if (!res.ok) throw new Error("Failed to fetch leaderboard")
      return res.json()
    },
  })

  const topFive = leaderboardData?.leaders?.slice(0, 5) || []

  return (
    <section className="py-12 border-t border-[var(--border-subtle)]">
      <div className="mx-auto max-w-content px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
            <h2 className="text-h2">Leaderboard</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/leaderboard")}>
            View All
            <ArrowRight className="h-4 w-4 ml-1" strokeWidth={1.5} />
          </Button>
        </div>

        {topFive.length > 0 && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] overflow-hidden">
            {topFive.map((leader, i) => (
              <div
                key={leader.id}
                className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border-subtle)] last:border-0"
              >
                <span
                  className={`text-mono-sm font-medium w-5 text-center ${
                    i === 0 ? "text-[var(--accent-premium)]" : "text-[var(--text-tertiary)]"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-[var(--text-primary)] flex-1">{leader.username}</span>
                <span className="text-mono-sm text-[var(--accent-gain)]">
                  +{formatUsdText(Number(leader.periodProfit || leader.totalProfit || 0))}
                </span>
              </div>
            ))}
          </div>
        )}

        {topFive.length === 0 && (
          <p className="text-sm text-[var(--text-tertiary)]">No leaderboard data yet.</p>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Alpha Desk Section
// ---------------------------------------------------------------------------

function AlphaDeskSection() {
  const [, setLocation] = useLocation()
  const { activeChain } = useChain()

  const { data: todayData, isLoading } = useQuery<{
    runDate: string
    chain: string
    ideas: Array<{
      id: number
      rank: number
      chain: string
      symbol: string
      name: string
      narrativeThesis: string
      confidenceScore: string
      riskFlags: string[]
      tokenAddress: string
    }>
  }>({
    queryKey: [`/api/alpha-desk/today`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/today?chain=${activeChain}`)
      if (!res.ok) throw new Error("Failed to fetch Alpha Desk picks")
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <section className="py-12 border-t border-[var(--border-subtle)]">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="h-5 w-5 text-[var(--accent-premium)]" />
            <h2 className="text-h2">Today&apos;s Alpha Desk</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-xl bg-[var(--bg-raised)] animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (!todayData?.ideas?.length) return null

  return (
    <section className="py-12 border-t border-[var(--border-subtle)]">
      <div className="mx-auto max-w-content px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--accent-premium)]" />
            <h2 className="text-h2">Today&apos;s Alpha Desk</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/alpha-desk")}>
            View All
            <ArrowRight className="h-4 w-4 ml-1" strokeWidth={1.5} />
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {todayData.ideas.map((idea, i) => (
            <motion.div
              key={idea.id}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="group relative flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5 transition-all hover:border-[var(--border-strong)] hover:shadow-lg cursor-pointer"
              onClick={() => setLocation(`/token/${idea.tokenAddress}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-premium)]/10 text-[var(--accent-premium)] font-mono text-xs font-bold">
                    {idea.rank}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">{idea.symbol}</h3>
                    <p className="text-[10px] text-[var(--text-secondary)]">{idea.name}</p>
                  </div>
                </div>
              </div>
              <p className="text-sm font-serif italic text-[var(--text-primary)] line-clamp-2">
                {idea.narrativeThesis}
              </p>
              <div className="flex flex-wrap gap-1 mt-auto">
                {idea.riskFlags.slice(0, 2).map((flag) => (
                  <span
                    key={flag}
                    className="inline-flex items-center rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Trade() {
  const [, setLocation] = useLocation()
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Hero */}
      <section className="relative pt-20 pb-12 md:pt-28 md:pb-16 overflow-hidden">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="max-w-3xl">
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <Badge variant="outline" className="mb-6 text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-gain)] mr-2" />
                Live Paper Trading
              </Badge>
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="text-display mb-6"
            >
              Trade without risk.
              <br />
              <span className="text-[var(--text-secondary)]">Master the market.</span>
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="text-body text-[var(--text-secondary)] max-w-xl mb-8 leading-relaxed"
            >
              Practice trading Solana and Base memecoins with virtual capital.
              Real-time market data. Zero financial risk. Investor-grade tools.
            </motion.p>

            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-4"
            >
              {isAuthenticated ? (
                <Button size="lg" onClick={() => setLocation("/trending")}>
                  Start Trading
                  <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                </Button>
              ) : (
                <Button size="lg" onClick={() => setLocation("/register")}>
                  Start Trading
                  <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                </Button>
              )}
              <Button variant="secondary" size="lg" onClick={() => setLocation("/predictions")}>
                <Brain className="h-4 w-4 mr-2" strokeWidth={1.5} />
                Predictions
              </Button>
            </motion.div>

            <StatsBar />
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <QuickActions />

      {/* Trending Tokens */}
      <TrendingPreview />

      {/* Active Predictions */}
      <PredictionsPreview />

      {/* Leaderboard */}
      <LeaderboardSection />

      {/* Alpha Desk */}
      <AlphaDeskSection />
    </div>
  )
}
