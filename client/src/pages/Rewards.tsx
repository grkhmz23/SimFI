import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import {
  Trophy,
  Clock,
  Gift,
  Zap,
  ArrowLeft,
  Coins,
  BarChart3,
  Users,
} from "lucide-react"
import { useLocation } from "wouter"

export default function Rewards() {
  const [, setLocation] = useLocation()
  const { isAuthenticated } = useAuth()
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0 })

  // Mock countdown to next rewards epoch
  useEffect(() => {
    const target = new Date()
    target.setUTCHours(24, 0, 0, 0)
    const update = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) {
        target.setUTCDate(target.getUTCDate() + 1)
      }
      const d = Math.floor(diff / (1000 * 60 * 60 * 24))
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const m = Math.floor((diff / (1000 * 60)) % 60)
      setCountdown({ days: d, hours: h, minutes: m })
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  const features = [
    {
      icon: Trophy,
      title: "Leaderboard Prizes",
      desc: "Top traders in each 6-hour period win ETH/SOL prizes distributed on-chain.",
    },
    {
      icon: Zap,
      title: "Streak Bonuses",
      desc: "Daily login streaks multiply your rewards. Don't break the chain.",
    },
    {
      icon: Users,
      title: "Referral Rewards",
      desc: "Earn a percentage of trading volume from everyone you invite.",
    },
    {
      icon: Gift,
      title: "Achievement Drops",
      desc: "Unlock badges and claim one-time rewards for trading milestones.",
    },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-20">
      <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
          Back
        </Button>

        <div className="text-center mb-10">
          <h1 className="text-h1 mb-3">Rewards</h1>
          <p className="text-body text-[var(--text-secondary)] max-w-xl mx-auto">
            Trade, compete, and earn. Rewards are distributed transparently to the most active and successful traders.
          </p>
        </div>

        {/* Countdown */}
        <Card className="mb-8 border-[var(--border-subtle)] bg-[var(--bg-raised)]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Next Epoch</p>
                  <p className="text-xs text-[var(--text-secondary)]">Resets daily at 00:00 UTC</p>
                </div>
              </div>
              <div className="flex gap-4">
                {[
                  { value: countdown.days, label: "Days" },
                  { value: countdown.hours, label: "Hours" },
                  { value: countdown.minutes, label: "Mins" },
                ].map((item) => (
                  <div key={item.label} className="text-center min-w-[56px]">
                    <div className="rounded-md bg-[var(--bg-base)] border border-[var(--border-subtle)] px-3 py-2">
                      <span className="text-lg font-mono font-semibold text-[var(--text-primary)]">
                        {String(item.value).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mt-1">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Coins className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
                <div>
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Epoch Pool</p>
                  <p className="text-lg font-mono font-semibold text-[var(--text-primary)]">—</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-[var(--accent-gain)]" strokeWidth={1.5} />
                <div>
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Your Rank</p>
                  <p className="text-lg font-mono font-semibold text-[var(--text-primary)]">—</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Gift className="h-5 w-5 text-[var(--accent-loss)]" strokeWidth={1.5} />
                <div>
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Claimable</p>
                  <p className="text-lg font-mono font-semibold text-[var(--text-primary)]">—</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {features.map((f) => (
            <Card key={f.title} className="border-[var(--border-subtle)] bg-[var(--bg-raised)]">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <f.icon className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{f.title}</p>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-raised)] text-center">
          <CardContent className="p-8">
            <Trophy className="h-10 w-10 text-[var(--accent-premium)] mx-auto mb-4" strokeWidth={1.5} />
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              Rewards are launching soon
            </h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-6">
              The rewards system is under development. Start trading now to build your track record
              and be ready when the first epoch goes live.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => setLocation("/trade")}>Start Trading</Button>
              <Button variant="outline" onClick={() => setLocation("/leaderboard")}>
                View Leaderboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
