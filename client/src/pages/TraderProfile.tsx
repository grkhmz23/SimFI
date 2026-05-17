import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell } from '@/components/ui/data-cell';
import { ChainChip } from '@/components/ui/chain-chip';
import { AchievementBadge } from '@/components/AchievementBadge';
import { useAuth } from '@/lib/auth-context';
import { formatNativeAmount } from '@/lib/token-format';
import { formatCount } from '@/lib/format';
import type { Trade, BadgeId, Chain } from '@shared/schema';
import { ArrowLeft, TrendingUp, TrendingDown, Clock, Target, Users, Award, Calendar, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { toBigInt } from '@/lib/token-format';

interface PublicTraderStats {
  id: string;
  username: string;
  createdAt: string;
  solanaWalletAddress: string | null;
  baseWalletAddress: string | null;
  balance: string;
  baseBalance: string;
  totalProfit: string;
  baseTotalProfit: string;
  winRate: number;
  avgHoldTimeSeconds: number;
  followerCount: number;
  isFollowing: boolean;
  achievements: BadgeId[];
}

interface TraderProfileResponse {
  trader: PublicTraderStats;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />}
        <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono tabular-nums text-lg text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const profit = toBigInt(trade.profitLoss);
  const isPositive = profit >= 0n;

  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Badge variant={isPositive ? 'gain' : 'loss'} className="shrink-0 text-xs">
          {isPositive ? '+' : ''}
          {formatNativeAmount(trade.profitLoss, trade.chain as Chain)} {trade.chain === 'base' ? 'ETH' : 'SOL'}
        </Badge>
        <span className="font-medium text-[var(--text-primary)] truncate text-sm">${trade.tokenSymbol}</span>
        <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap hidden sm:block">
          {formatDistanceToNow(new Date(trade.closedAt), { addSuffix: true })}
        </span>
      </div>
      <ChainChip chain={trade.chain as Chain} />
    </div>
  );
}

export default function TraderProfile() {
  const { username } = useParams<{ username: string }>();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isMe = user?.username === username;

  const {
    data: profileData,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useQuery<TraderProfileResponse>({
    queryKey: [`/api/traders/${username}`],
    enabled: !!username,
  });

  const { data: tradesData, isLoading: tradesLoading, isError: tradesError } = useQuery<{ trades: Trade[] }>({
    queryKey: [`/api/traders/${username}/trades`],
    enabled: !!username,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = document.cookie.match(/csrfToken=([^;]+)/)?.[1];
      const res = await fetch(`/api/traders/${username}/follow`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to follow trader');
      }
      return res.json() as Promise<{ following: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/traders/${username}`] });
      toast({
        title: data.following ? 'Following' : 'Unfollowed',
        description: data.following
          ? `You are now following @${username}`
          : `Unfollowed @${username}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const profile = profileData?.trader;
  const trades = tradesData?.trades || [];

  const { bestTrade, worstTrade } = useMemo(() => {
    if (trades.length === 0) return { bestTrade: undefined, worstTrade: undefined };
    const best = trades.reduce((a, b) => (toBigInt(a.profitLoss) > toBigInt(b.profitLoss) ? a : b));
    const worst = trades.reduce((a, b) => (toBigInt(a.profitLoss) < toBigInt(b.profitLoss) ? a : b));
    return { bestTrade: best, worstTrade: worst };
  }, [trades]);

  const formatHoldTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  };

  if (profileLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 pb-20 lg:pb-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-48 w-full mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-4" />
        <h1 className="font-display text-2xl text-[var(--text-primary)] mb-2">Failed to load profile</h1>
        <p className="text-[var(--text-secondary)] mb-6">Could not load @{username}&apos;s profile.</p>
        <Button variant="outline" onClick={() => refetchProfile()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-[var(--text-primary)] mb-2">Trader not found</h1>
        <p className="text-[var(--text-secondary)]">@{username} doesn&apos;t exist.</p>
        <Link href="/leaderboard">
          <Button variant="outline" className="mt-6">Back to Leaderboard</Button>
        </Link>
      </div>
    );
  }

  const solProfitBig = toBigInt(profile.totalProfit);
  const baseProfitBig = toBigInt(profile.baseTotalProfit);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-20 lg:pb-8">
      <Link href="/leaderboard">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Leaderboard
        </Button>
      </Link>

      {/* Own-profile banner */}
      {isMe && (
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)]">This is your public profile.</p>
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button size="sm" variant="outline" className="text-xs h-7">Dashboard</Button>
            </Link>
            <Link href="/portfolio">
              <Button size="sm" variant="outline" className="text-xs h-7">Portfolio</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Profile Header */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl text-[var(--text-primary)] mb-1">@{profile.username}</h1>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>Member since {new Date(profile.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            {!isMe && isAuthenticated && (
              <Button
                onClick={() => followMutation.mutate()}
                variant={profile.isFollowing ? 'outline' : 'default'}
                disabled={followMutation.isPending}
                className="shrink-0"
              >
                {followMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {profile.isFollowing ? 'Unfollow' : 'Follow'}
              </Button>
            )}
          </div>

          {/* Stats Grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard
              label="Solana P&L"
              value={
                <DataCell
                  value={formatNativeAmount(profile.totalProfit, 'solana')}
                  variant={solProfitBig >= 0n ? 'gain' : 'loss'}
                  prefix={solProfitBig >= 0n ? '+' : ''}
                  suffix=" SOL"
                />
              }
              icon={TrendingUp}
            />
            <StatCard
              label="Base P&L"
              value={
                <DataCell
                  value={formatNativeAmount(profile.baseTotalProfit, 'base')}
                  variant={baseProfitBig >= 0n ? 'gain' : 'loss'}
                  prefix={baseProfitBig >= 0n ? '+' : ''}
                  suffix=" ETH"
                />
              }
              icon={TrendingUp}
            />
            <StatCard
              label="Win Rate"
              value={`${profile.winRate}%`}
              icon={Target}
            />
            <StatCard
              label="Avg Hold"
              value={formatHoldTime(profile.avgHoldTimeSeconds)}
              icon={Clock}
            />
            <StatCard
              label="Followers"
              value={formatCount(profile.followerCount)}
              icon={Users}
            />
            {trades.length > 0 && (
              <StatCard
                label="Trades"
                value={formatCount(trades.length)}
                icon={TrendingUp}
              />
            )}
            {bestTrade && (
              <StatCard
                label="Best Trade"
                value={
                  <DataCell
                    value={formatNativeAmount(bestTrade.profitLoss, bestTrade.chain as Chain)}
                    variant="gain"
                    prefix="+"
                    suffix={` ${bestTrade.chain === 'base' ? 'ETH' : 'SOL'}`}
                  />
                }
                icon={TrendingUp}
              />
            )}
            {worstTrade && (
              <StatCard
                label="Worst Trade"
                value={
                  <DataCell
                    value={formatNativeAmount(worstTrade.profitLoss, worstTrade.chain as Chain)}
                    variant="loss"
                    suffix={` ${worstTrade.chain === 'base' ? 'ETH' : 'SOL'}`}
                  />
                }
                icon={TrendingDown}
              />
            )}
          </div>
        </div>
      </Card>

      {/* Achievements */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-[var(--accent-premium)]" />
            Achievement Badges
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.achievements.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              {profile.achievements.map((badgeId) => (
                <AchievementBadge key={badgeId} badgeId={badgeId} unlocked />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">No badges unlocked yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
          <CardDescription>Last 10 closed paper trades</CardDescription>
        </CardHeader>
        <CardContent>
          {tradesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : tradesError ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-4">
              <AlertCircle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
              Could not load trades.
            </div>
          ) : trades.length > 0 ? (
            <div className="space-y-2">
              {trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">No trades yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
