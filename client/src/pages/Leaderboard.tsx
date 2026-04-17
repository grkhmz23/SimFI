import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell } from '@/components/ui/data-cell';
import { ChainChip } from '@/components/ui/chain-chip';
import { BarChart3, Activity, Target, Clock, Trophy } from 'lucide-react';
import { Link } from 'wouter';
import { useChain } from '@/lib/chain-context';
import { formatNative } from '@/lib/token-format';
import { cn } from '@/lib/utils';
import type { LeaderboardEntry, Chain } from '@shared/schema';
import { useState, useEffect, useMemo } from 'react';

interface PeriodData {
  leaders: LeaderboardEntry[];
  periodStart: string;
  periodEnd: string;
}

interface PastWinner extends LeaderboardEntry {
  periodStart: string;
  periodEnd: string;
}

function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const targetDate = new Date(target);
  const diff = targetDate.getTime() - now.getTime();

  if (diff <= 0) {
    return <DataCell value="Closed" variant="gain" />;
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return (
    <DataCell
      value={`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
      variant="premium"
    />
  );
}

function RankBadge({ rank, isPremium }: { rank: number; isPremium: boolean }) {
  if (isPremium) {
    return (
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-full border text-sm font-bold',
          'border-[rgba(201,169,110,0.25)] bg-[rgba(201,169,110,0.15)] text-[var(--accent-premium)]'
        )}
      >
        {rank === 1 ? <Trophy className="w-4 h-4" /> : rank}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-tertiary)] text-sm font-bold">
      {rank}
    </div>
  );
}

function LeaderboardRow({
  entry,
  index,
  profitKey,
}: {
  entry: LeaderboardEntry;
  index: number;
  profitKey: 'totalProfit' | 'periodProfit';
}) {
  const profit = entry[profitKey] ?? 0;
  const isTopThree = index < 3;
  const isPositive = profit >= 0;
  const chain = entry.chain || 'solana';

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border transition-colors',
        isTopThree
          ? 'border-[rgba(201,169,110,0.20)] bg-[rgba(201,169,110,0.05)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:bg-[rgba(255,255,255,0.02)]'
      )}
    >
      <div className="flex items-center justify-center w-10 shrink-0">
        <RankBadge rank={index + 1} isPremium={isTopThree} />
      </div>

      <div className="flex-1 min-w-0">
        <Link href={`/trader/${entry.username}`}>
          <span className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-premium)] transition-colors cursor-pointer truncate block">
            {entry.username}
          </span>
        </Link>
        {entry.walletAddress && (
          <span className="text-xs text-[var(--text-tertiary)] font-mono truncate block">
            {entry.walletAddress.slice(0, 4)}...{entry.walletAddress.slice(-4)}
          </span>
        )}
      </div>

      <div className="text-right shrink-0">
        <DataCell
          value={formatNative(profit, chain as Chain)}
          variant={isPositive ? 'gain' : 'loss'}
          prefix={isPositive ? '+' : ''}
          suffix={` ${chain === 'solana' ? 'SOL' : 'ETH'}`}
        />
      </div>

      <div className="shrink-0 w-20 text-right hidden sm:block">
        <ChainChip chain={chain as Chain} />
      </div>
    </div>
  );
}

function LeaderboardList({
  leaders,
  profitKey,
  isLoading,
  emptyMessage,
}: {
  leaders: LeaderboardEntry[];
  profitKey: 'totalProfit' | 'periodProfit';
  isLoading: boolean;
  emptyMessage: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (leaders.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
        <p className="text-lg text-[var(--text-secondary)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leaders.map((entry, index) => (
        <LeaderboardRow key={`${entry.id}-${index}`} entry={entry} index={index} profitKey={profitKey} />
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const { activeChain } = useChain();

  const { data: overallData, isLoading: overallLoading } = useQuery<{ leaders: LeaderboardEntry[] }>({
    queryKey: [`/api/leaderboard/overall?chain=${activeChain}`],
  });

  const { data: periodData, isLoading: periodLoading } = useQuery<PeriodData>({
    queryKey: [`/api/leaderboard/current-period?chain=${activeChain}`],
  });

  const { data: winnersData, isLoading: winnersLoading } = useQuery<{ winners: PastWinner[] }>({
    queryKey: ['/api/leaderboard/winners'],
  });

  const overall = overallData?.leaders || [];
  const currentPeriod = periodData?.leaders || [];
  const pastWinners = winnersData?.winners || [];

  const periodGroups = useMemo(() => {
    const map = new Map<string, PastWinner[]>();
    for (const winner of pastWinners) {
      const key = `${winner.periodStart}-${winner.periodEnd}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(winner);
    }
    return Array.from(map.entries()).map(([key, winners]) => ({
      key,
      periodStart: winners[0].periodStart,
      periodEnd: winners[0].periodEnd,
      winners,
    }));
  }, [pastWinners]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="font-serif text-4xl text-[var(--text-primary)] mb-2">Leaderboard</h1>
        <p className="text-[var(--text-secondary)]">Top traders by realized profit</p>
      </div>

      <Tabs defaultValue="period" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="period" className="gap-2">
            <Activity className="h-4 w-4" />
            Current 6h
          </TabsTrigger>
          <TabsTrigger value="overall" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            All Time
          </TabsTrigger>
          <TabsTrigger value="winners" className="gap-2">
            <Target className="h-4 w-4" />
            Past Winners
          </TabsTrigger>
        </TabsList>

        <TabsContent value="period">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Current 6-Hour Period</CardTitle>
                <CardDescription>Live rankings for the active trading period</CardDescription>
              </div>
              {periodData?.periodEnd && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <Countdown target={periodData.periodEnd} />
                </div>
              )}
            </CardHeader>
            <CardContent>
              <LeaderboardList
                leaders={currentPeriod}
                profitKey="periodProfit"
                isLoading={periodLoading}
                emptyMessage="No trades in the current period yet"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overall">
          <Card>
            <CardHeader>
              <CardTitle>All-Time Leaders</CardTitle>
              <CardDescription>Top traders by total realized profit</CardDescription>
            </CardHeader>
            <CardContent>
              <LeaderboardList
                leaders={overall}
                profitKey="totalProfit"
                isLoading={overallLoading}
                emptyMessage="No leaderboard data yet"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="winners">
          <div className="space-y-6">
            {winnersLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))
            ) : periodGroups.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16">
                  <Target className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
                  <p className="text-lg text-[var(--text-secondary)]">No past winners yet</p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-2">
                    Trade to become a winner in the next period
                  </p>
                </CardContent>
              </Card>
            ) : (
              periodGroups.map((group) => (
                <Card key={group.key}>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle>
                        {new Date(group.periodStart).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        –{' '}
                        {new Date(group.periodEnd).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </CardTitle>
                      <Badge variant="secondary">
                        {new Date(group.periodStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                        {new Date(group.periodEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <LeaderboardList
                      leaders={group.winners}
                      profitKey="periodProfit"
                      isLoading={false}
                      emptyMessage="No winners for this period"
                    />
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
