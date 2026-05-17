import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AchievementBadge } from "@/components/AchievementBadge"
import { ALL_BADGE_IDS } from "@/lib/achievements"
import { useAuth } from "@/lib/auth-context"
import type { UserAchievement } from "@shared/schema"
import {
  Trophy,
  Clock,
  Flame,
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Wallet,
  AlertCircle,
  RefreshCw,
  LogIn,
  Check,
  Lock,
} from "lucide-react"
import { useLocation } from "wouter"
import { cn } from "@/lib/utils"

interface StreakData {
  streakCount: number;
  lastStreakDate: string | null;
  canClaim: boolean;
  nextBonus: number;
}

export default function Rewards() {
  const [, setLocation] = useLocation()
  const { isAuthenticated } = useAuth()
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const getTarget = () => {
      const t = new Date()
      t.setUTCDate(t.getUTCDate() + 1)
      t.setUTCHours(0, 0, 0, 0)
      return t
    }
    let target = getTarget()
    const update = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) target = getTarget()
      const h = Math.floor(diff / (1000 * 60 * 60)) % 24
      const m = Math.floor((diff / (1000 * 60)) % 60)
      const s = Math.floor((diff / 1000) % 60)
      setCountdown({ hours: h, minutes: m, seconds: s })
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  const {
    data: streakData,
    isLoading: streakLoading,
    isError: streakError,
    refetch: refetchStreak,
  } = useQuery<StreakData>({
    queryKey: ['/api/streak'],
    enabled: isAuthenticated,
  })

  const {
    data: achievementsData,
    isLoading: achievementsLoading,
    isError: achievementsError,
    refetch: refetchAchievements,
  } = useQuery<{ achievements: UserAchievement[] }>({
    queryKey: ['/api/achievements'],
    enabled: isAuthenticated,
  })

  const unlockedSet = new Set(achievementsData?.achievements.map((a) => a.badgeId) || [])
  const unlockedBadges = ALL_BADGE_IDS.filter((id) => unlockedSet.has(id))
  const lockedBadges = ALL_BADGE_IDS.filter((id) => !unlockedSet.has(id))

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-20">
      <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
          Back
        </Button>

        <div className="mb-8">
          <h1 className="text-h1 mb-2">Rewards</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Paper trading game loop — streaks, achievements, and leaderboard rankings.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            All balances and rewards are paper (simulated). No real money is involved.
          </p>
        </div>

        {/* Streak Section — only for authenticated users */}
        {isAuthenticated ? (
          <div className="mb-8">
            <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">Daily Streak</h2>
            {streakLoading ? (
              <Skeleton className="h-28 rounded-xl" />
            ) : streakError ? (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
                <AlertCircle className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
                <p className="text-sm text-[var(--text-secondary)]">Could not load streak data.</p>
                <button
                  onClick={() => refetchStreak()}
                  className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-md px-3 py-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            ) : streakData ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent-premium)]/10 shrink-0">
                      <Flame className="h-7 w-7 text-[var(--accent-premium)]" />
                    </div>
                    <div>
                      <p className="text-3xl font-bold font-mono text-[var(--text-primary)]">
                        {streakData.streakCount}
                        <span className="text-base font-normal text-[var(--text-secondary)] ml-1">
                          {streakData.streakCount === 1 ? 'day' : 'days'}
                        </span>
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {streakData.canClaim
                          ? 'Claim today\'s bonus to keep your streak alive'
                          : 'Streak bonus claimed — come back tomorrow'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <div className={cn(
                      "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border",
                      streakData.canClaim
                        ? "border-[var(--accent-premium)]/30 bg-[var(--accent-premium)]/10 text-[var(--accent-premium)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)]"
                    )}>
                      {streakData.canClaim ? (
                        <>
                          <Flame className="h-3 w-3" />
                          Claimable
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3" />
                          Claimed today
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)]">
                      Next bonus: +{streakData.nextBonus} paper ETH
                    </p>
                  </div>
                </div>

                {/* Streak milestones */}
                <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                  <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Streak milestones</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                      <div
                        key={day}
                        className={cn(
                          "flex items-center justify-center w-8 h-8 rounded-full text-xs font-mono border",
                          streakData.streakCount >= day
                            ? "border-[var(--accent-premium)]/40 bg-[var(--accent-premium)]/15 text-[var(--accent-premium)]"
                            : "border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-tertiary)]"
                        )}
                        title={`Day ${day}`}
                      >
                        {day}
                      </div>
                    ))}
                    <span className="text-[10px] text-[var(--text-tertiary)]">→ Day 7: +0.25 paper ETH</span>
                  </div>
                </div>

                <div className="mt-4">
                  <Button size="sm" onClick={() => setLocation('/trade')} className="w-full sm:w-auto">
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                    Trade to maintain streak
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <Card className="mb-8 border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <LogIn className="h-8 w-8 text-[var(--text-tertiary)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Log in to track your streak</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Daily login streaks earn paper bonuses and keep you on the leaderboard.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => setLocation('/login')}>Login</Button>
                  <Button size="sm" variant="outline" onClick={() => setLocation('/register')}>Register</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Epoch countdown */}
        <Card className="mb-8 border-[var(--border-subtle)] bg-[var(--bg-raised)]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Leaderboard period resets</p>
                  <p className="text-xs text-[var(--text-secondary)]">Every 6 hours — rankings reset for a fresh competition</p>
                </div>
              </div>
              <div className="flex gap-3">
                {[
                  { value: countdown.hours, label: "H" },
                  { value: countdown.minutes, label: "M" },
                  { value: countdown.seconds, label: "S" },
                ].map((item) => (
                  <div key={item.label} className="text-center min-w-[44px]">
                    <div className="rounded-md bg-[var(--bg-base)] border border-[var(--border-subtle)] px-2 py-1.5">
                      <span className="text-lg font-mono font-semibold text-[var(--text-primary)]">
                        {String(item.value).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mt-1">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Achievements */}
        <div className="mb-8">
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">Achievements</h2>

          {!isAuthenticated ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-8 text-center">
              <Trophy className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-3" strokeWidth={1.5} />
              <p className="text-sm text-[var(--text-secondary)]">Log in to track your achievement badges</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                {ALL_BADGE_IDS.slice(0, 4).map((id) => (
                  <AchievementBadge key={id} badgeId={id} unlocked={false} size="sm" />
                ))}
              </div>
            </div>
          ) : achievementsLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : achievementsError ? (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
              <AlertCircle className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
              <p className="text-sm text-[var(--text-secondary)]">Could not load achievements.</p>
              <button
                onClick={() => refetchAchievements()}
                className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-md px-3 py-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Unlocked */}
              {unlockedBadges.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Check className="h-3.5 w-3.5 text-[var(--accent-gain)]" />
                    <p className="text-xs font-medium text-[var(--accent-gain)] uppercase tracking-wider">
                      Unlocked ({unlockedBadges.length})
                    </p>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                    {unlockedBadges.map((id) => (
                      <AchievementBadge key={id} badgeId={id} unlocked size="md" />
                    ))}
                  </div>
                </div>
              )}

              {/* Locked */}
              {lockedBadges.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Lock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                      Locked ({lockedBadges.length})
                    </p>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                    {lockedBadges.map((id) => (
                      <AchievementBadge key={id} badgeId={id} unlocked={false} size="md" />
                    ))}
                  </div>
                </div>
              )}

              {unlockedBadges.length === 0 && lockedBadges.length === 0 && (
                <p className="text-sm text-[var(--text-tertiary)]">No achievement data available.</p>
              )}
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setLocation('/trade')}
            className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4 text-left hover:border-[var(--border-strong)] transition-colors"
          >
            <TrendingUp className="h-5 w-5 text-[var(--accent-gain)] shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Start Trading</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Earn achievements and streak bonuses</p>
            </div>
          </button>
          <button
            onClick={() => setLocation('/leaderboard')}
            className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4 text-left hover:border-[var(--border-strong)] transition-colors"
          >
            <BarChart3 className="h-5 w-5 text-[var(--accent-premium)] shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Leaderboard</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Compete in 6-hour periods</p>
            </div>
          </button>
          <button
            onClick={() => setLocation('/portfolio')}
            className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4 text-left hover:border-[var(--border-strong)] transition-colors"
          >
            <Wallet className="h-5 w-5 text-[var(--text-secondary)] shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Portfolio</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Track your paper trading progress</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
