import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'wouter';
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
import { cn } from '@/lib/utils';
import type { Trade, BadgeId, Chain } from '@shared/schema';
import { ArrowLeft, TrendingUp, TrendingDown, Clock, Target, Users, Award, Calendar } from 'lucide-react';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';
import { useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';

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
  const profit = BigInt(trade.profitLoss);
  const isPositive = profit >= 0n;

  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
      <div className="flex items-center gap-3 min-w-0">
        <Badge variant={isPositive ? 'gain' : 'loss'} className="shrink-0">
          {isPositive ? '+' : ''}
          {formatNativeAmount(trade.profitLoss, trade.chain as Chain)} {trade.chain === 'base' ? 'ETH' : 'SOL'}
        </Badge>
        <span className="font-medium text-[var(--text-primary)] truncate">${trade.tokenSymbol}</span>
        <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">
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

  const { data: profileData, isLoading: profileLoading } = useQuery<TraderProfileResponse>({
    queryKey: [`/api/traders/${username}`],
    enabled: !!username,
  });

  const { data: tradesData, isLoading: tradesLoading } = useQuery<{ trades: Trade[] }>({
    queryKey: [`/api/traders/${username}/trades`],
    enabled: !!username,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/traders/${username}/follow`, {
        method: 'POST',
        credentials: 'include',
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
    const best = trades.reduce((a, b) => (BigInt(a.profitLoss) > BigInt(b.profitLoss) ? a : b));
    const worst = trades.reduce((a, b) => (BigInt(a.profitLoss) < BigInt(b.profitLoss) ? a : b));
    return { bestTrade: best, worstTrade: worst };
  }, [trades]);

  if (profileLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
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

  if (!profile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="font-serif text-3xl text-[var(--text-primary)] mb-2">Trader not found</h1>
        <p className="text-[var(--text-secondary)]">@{username} doesn&apos;t exist.</p>
      </div>
    );
  }

  const formatHoldTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
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

      {/* Profile Header */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl text-[var(--text-primary)] mb-1">@{profile.username}</h1>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Calendar className="h-3.5 w-3.5" />
                <span>Member since {new Date(profile.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            {!isMe && isAuthenticated && (
              <Button
                onClick={() => followMutation.mutate()}
                variant={profile.isFollowing ? 'outline' : 'default'}
                disabled={followMutation.isPending}
              >
                {profile.isFollowing ? 'Unfollow' : 'Follow'}
              </Button>
            )}
          </div>

          {/* Stats Grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Solana P&L"
              value={
                <DataCell
                  value={formatNativeAmount(profile.totalProfit, 'solana')}
                  variant={Number(profile.totalProfit) >= 0 ? 'gain' : 'loss'}
                  prefix={Number(profile.totalProfit) >= 0 ? '+' : ''}
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
                  variant={Number(profile.baseTotalProfit) >= 0 ? 'gain' : 'loss'}
                  prefix={Number(profile.baseTotalProfit) >= 0 ? '+' : ''}
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
          <CardDescription>Last 10 closed positions</CardDescription>
        </CardHeader>
        <CardContent>
          {tradesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
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
