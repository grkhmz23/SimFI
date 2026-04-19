import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChainChip } from "@/components/ui/chain-chip"
import { useAuth } from "@/lib/auth-context"
import { useChain } from "@/lib/chain-context"
import { formatUsdText } from "@/lib/format"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  ArrowRight,
  TrendingUp,
  Shield,
  BarChart3,
  Trophy,
} from "lucide-react"

interface LeaderboardEntry {
  id: string
  username: string
  walletAddress?: string
  periodProfit?: string
  totalProfit?: string
  rank?: number
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

export default function Trade() {
  const [, setLocation] = useLocation()
  const { isAuthenticated } = useAuth()
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

  const topThree = leaderboardData?.leaders?.slice(0, 3) || []

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Hero */}
      <section className="relative pt-20 pb-24 md:pt-32 md:pb-40 overflow-hidden">
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
              className="text-body text-[var(--text-secondary)] max-w-xl mb-10 leading-relaxed"
            >
              Practice trading Solana and Base memecoins with virtual capital.
              Real-time market data. Zero financial risk. Investor-grade tools.
            </motion.p>

            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-4 mb-16"
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
              <Button variant="secondary" size="lg" onClick={() => setLocation("/about")}>
                How it Works
              </Button>
            </motion.div>

            {/* Leaderboard Teaser */}
            {topThree.length > 0 && (
              <motion.div
                custom={4}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
              >
                <p className="text-small text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
                  Current Period Leaders — {activeChain}
                </p>
                <div className="flex flex-col gap-2 max-w-md">
                  {topThree.map((leader, i) => (
                    <div
                      key={leader.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-raised)]"
                    >
                      <span
                        className={`text-mono-sm font-medium w-5 text-center ${
                          i === 0
                            ? "text-[var(--accent-premium)]"
                            : "text-[var(--text-tertiary)]"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-[var(--text-primary)] flex-1">
                        {leader.username}
                      </span>
                      <span className="text-mono-sm text-[var(--accent-gain)]">
                        +$
                        {formatUsdText(Number(leader.periodProfit || leader.totalProfit || 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* Feature Sections */}
      <section className="py-24 border-t border-[var(--border-subtle)]">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {/* Trade without risk */}
            <div>
              <div className="h-10 w-10 rounded-md bg-[rgba(63,168,118,0.1)] border border-[rgba(63,168,118,0.15)] flex items-center justify-center mb-5">
                <Shield className="h-5 w-5 text-[var(--accent-gain)]" strokeWidth={1.5} />
              </div>
              <h3 className="text-h3 mb-3">Trade without risk</h3>
              <p className="text-body text-[var(--text-secondary)] leading-relaxed">
                Start with 5 ETH and 10 SOL in virtual balance. Execute trades with real
                market prices from DexScreener and Jupiter — no real capital at stake.
              </p>
            </div>

            {/* Learn the trenches */}
            <div>
              <div className="h-10 w-10 rounded-md bg-[rgba(201,169,110,0.1)] border border-[rgba(201,169,110,0.15)] flex items-center justify-center mb-5">
                <BarChart3 className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
              </div>
              <h3 className="text-h3 mb-3">Learn the trenches</h3>
              <p className="text-body text-[var(--text-secondary)] leading-relaxed">
                Study token metadata, wallet portfolios, and transaction history.
                Build pattern recognition before you commit real money.
              </p>
            </div>

            {/* Compete and climb */}
            <div>
              <div className="h-10 w-10 rounded-md bg-[rgba(194,77,77,0.1)] border border-[rgba(194,77,77,0.15)] flex items-center justify-center mb-5">
                <Trophy className="h-5 w-5 text-[var(--accent-loss)]" strokeWidth={1.5} />
              </div>
              <h3 className="text-h3 mb-3">Compete and climb</h3>
              <p className="text-body text-[var(--text-secondary)] leading-relaxed">
                Six-hour competitive periods with live leaderboards. Track your win rate,
                best trades, and streak bonuses as you climb the ranks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 border-t border-[var(--border-subtle)]">
        <div className="mx-auto max-w-content px-4 sm:px-6 text-center">
          <h2 className="text-h1 mb-4">Ready to start?</h2>
          <p className="text-body text-[var(--text-secondary)] max-w-lg mx-auto mb-8">
            Join SimFi and practice trading with real market data in a risk-free environment.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {isAuthenticated ? (
              <Button size="lg" onClick={() => setLocation("/trending")}>
                Explore Markets
                <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
              </Button>
            ) : (
              <Button size="lg" onClick={() => setLocation("/register")}>
                Get Started
                <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
              </Button>
            )}
            <Button variant="secondary" size="lg" onClick={() => setLocation("/leaderboard")}>
              <TrendingUp className="h-4 w-4 mr-2" strokeWidth={1.5} />
              View Leaderboard
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
