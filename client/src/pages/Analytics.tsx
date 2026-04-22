import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { useChain } from '@/lib/chain-context';
import { formatUsdText, formatPct, formatNative } from '@/lib/format';
import { LogIn, TrendingUp, TrendingDown, Clock, Target, BarChart3, Trophy, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { Trade } from '@shared/schema';

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  }),
};

interface TradeAnalytics {
  overview: {
    totalTrades: number;
    winRate: number;
    avgHoldTimeHours: number;
    totalRealizedPnlNative: number;
    totalRealizedPnlUsd: number;
  };
  pnlTimeline: { date: string; cumulativePnlNative: number; cumulativePnlUsd: number }[];
  winRateByToken: {
    tokenSymbol: string;
    tokenAddress: string;
    chain: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnlNative: number;
    avgPnlNative: number;
  }[];
  durationDistribution: {
    bucket: string;
    label: string;
    count: number;
    winRate: number;
  }[];
  topWinners: Trade[];
  topLosers: Trade[];
  monthlySummary: {
    month: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnlNative: number;
    totalPnlUsd: number;
  }[];
  chainComparison: {
    chain: string;
    trades: number;
    winRate: number;
    totalPnlNative: number;
    totalPnlUsd: number;
  }[];
}

const CHART_COLORS = {
  gain: '#3fa876',
  loss: '#c24d4d',
  premium: '#c9a96e',
  neutral: '#5f5d58',
  primary: '#f5f3ee',
};

export default function Analytics() {
  const { isAuthenticated } = useAuth();
  const { activeChain } = useChain();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<TradeAnalytics>({
    queryKey: ['/api/analytics', activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?chain=${activeChain}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const overview = data?.overview;
  const isProfit = (overview?.totalRealizedPnlUsd || 0) >= 0;

  const winLossData = useMemo(() => {
    if (!data) return [];
    const wins = data.overview.winRate > 0
      ? Math.round((data.overview.winRate / 100) * data.overview.totalTrades)
      : 0;
    const losses = data.overview.totalTrades - wins;
    return [
      { name: 'Wins', value: wins, color: CHART_COLORS.gain },
      { name: 'Losses', value: losses, color: CHART_COLORS.loss },
    ];
  }, [data]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="min-h-[60vh] flex items-center justify-center">
            <Card className="card-raised p-12 text-center max-w-md">
              <LogIn className="h-16 w-16 mx-auto text-[var(--text-secondary)] mb-6" />
              <h2 className="text-3xl font-bold mb-4 text-[var(--text-primary)]">Login Required</h2>
              <p className="text-[var(--text-secondary)] mb-8">
                Sign in to view your trading analytics and performance insights
              </p>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={() => setLocation('/login')}>Login</Button>
                <Button variant="outline" className="flex-1" onClick={() => setLocation('/register')}>
                  Get Started
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="skeleton-shimmer h-10 w-64 rounded mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="card-raised h-32 skeleton-shimmer" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="card-raised h-80 skeleton-shimmer" />
            <Card className="card-raised h-80 skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.overview.totalTrades === 0) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <h1 className="font-serif text-4xl font-medium text-[var(--text-primary)] mb-2">
            Trade Analytics
          </h1>
          <p className="text-[var(--text-secondary)] mb-8">
            Deep insights into your trading performance
          </p>
          <Card className="card-raised p-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" strokeWidth={1.5} />
            <h3 className="text-xl font-medium text-[var(--text-primary)] mb-2">No trades yet</h3>
            <p className="text-[var(--text-secondary)] mb-6">
              Start trading to see your performance analytics, win rate, and P&L breakdown.
            </p>
            <Button onClick={() => setLocation('/trade')}>Start Trading</Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-20 lg:pb-0">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-medium text-[var(--text-primary)] mb-2">
            Trade Analytics
          </h1>
          <p className="text-[var(--text-secondary)]">
            Deep insights into your trading performance
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="card-raised p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-[var(--accent-premium)]/10 p-2">
                  <Target className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
                </div>
                <span className="text-sm text-[var(--text-secondary)]">Total Trades</span>
              </div>
              <div className="font-mono text-2xl font-medium text-[var(--text-primary)]">
                {overview?.totalTrades || 0}
              </div>
            </Card>
          </motion.div>

          <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="card-raised p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-[var(--accent-gain)]/10 p-2">
                  <Trophy className="h-5 w-5 text-[var(--accent-gain)]" strokeWidth={1.5} />
                </div>
                <span className="text-sm text-[var(--text-secondary)]">Win Rate</span>
              </div>
              <div className="font-mono text-2xl font-medium text-[var(--accent-gain)]">
                {formatPct(overview?.winRate || 0)}
              </div>
            </Card>
          </motion.div>

          <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="card-raised p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-[var(--text-secondary)]/10 p-2">
                  <Clock className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
                </div>
                <span className="text-sm text-[var(--text-secondary)]">Avg Hold Time</span>
              </div>
              <div className="font-mono text-2xl font-medium text-[var(--text-primary)]">
                {overview?.avgHoldTimeHours
                  ? overview.avgHoldTimeHours < 1
                    ? `${Math.round(overview.avgHoldTimeHours * 60)}m`
                    : `${Math.round(overview.avgHoldTimeHours)}h`
                  : '—'}
              </div>
            </Card>
          </motion.div>

          <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="card-raised p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn('rounded-lg p-2', isProfit ? 'bg-[var(--accent-gain)]/10' : 'bg-[var(--accent-loss)]/10')}>
                  {isProfit ? (
                    <TrendingUp className="h-5 w-5 text-[var(--accent-gain)]" strokeWidth={1.5} />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-[var(--accent-loss)]" strokeWidth={1.5} />
                  )}
                </div>
                <span className="text-sm text-[var(--text-secondary)]">Realized P&L</span>
              </div>
              <div className={cn('font-mono text-2xl font-medium', isProfit ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                {isProfit ? '+' : ''}
                {formatUsdText(overview?.totalRealizedPnlUsd || 0)}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* P&L Timeline */}
          <Card className="card-raised p-5">
            <CardHeader className="px-0 pt-0 pb-4">
              <CardTitle className="text-lg font-medium text-[var(--text-primary)]">
                Cumulative Realized P&L
              </CardTitle>
            </CardHeader>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.pnlTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-subtle)' }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-raised)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                    formatter={(value: number) => [formatUsdText(value), 'Cumulative P&L']}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativePnlUsd"
                    stroke={isProfit ? CHART_COLORS.gain : CHART_COLORS.loss}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Win/Loss Distribution */}
          <Card className="card-raised p-5">
            <CardHeader className="px-0 pt-0 pb-4">
              <CardTitle className="text-lg font-medium text-[var(--text-primary)]">
                Win / Loss Distribution
              </CardTitle>
            </CardHeader>
            <div className="h-72 flex items-center justify-center">
              {winLossData.length > 0 && winLossData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={winLossData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {winLossData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-raised)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[var(--text-secondary)]">No data</p>
              )}
            </div>
            <div className="flex justify-center gap-6 mt-2">
              {winLossData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-sm text-[var(--text-secondary)]">
                    {entry.name}: {entry.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Duration Distribution */}
        <Card className="card-raised p-5 mb-8">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle className="text-lg font-medium text-[var(--text-primary)]">
              Hold Time Distribution
            </CardTitle>
          </CardHeader>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.durationDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-raised)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'count') return [`${value} trades`, 'Trades'];
                    return [formatPct(value), 'Win Rate'];
                  }}
                />
                <Bar dataKey="count" fill={CHART_COLORS.premium} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top Winners / Losers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Winners */}
          <Card className="card-raised p-5">
            <CardHeader className="px-0 pt-0 pb-4">
              <CardTitle className="text-lg font-medium text-[var(--accent-gain)] flex items-center gap-2">
                <Trophy className="h-5 w-5" strokeWidth={1.5} />
                Top Winners
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {data.topWinners.map((trade, i) => {
                const pnlNative = Number(trade.profitLoss);
                const isSolana = trade.chain === 'solana';
                const pnlDisplay = isSolana ? pnlNative / 1e9 : pnlNative / 1e18;
                return (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0 cursor-pointer hover:opacity-80"
                    onClick={() => setLocation(`/token/${trade.tokenAddress}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-[var(--text-tertiary)] w-5">{i + 1}</span>
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{trade.tokenSymbol}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{trade.chain}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-[var(--accent-gain)]">
                        +{formatNative(pnlDisplay, trade.chain as 'base' | 'solana')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Top Losers */}
          <Card className="card-raised p-5">
            <CardHeader className="px-0 pt-0 pb-4">
              <CardTitle className="text-lg font-medium text-[var(--accent-loss)] flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
                Top Losers
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {data.topLosers.map((trade, i) => {
                const pnlNative = Number(trade.profitLoss);
                const isSolana = trade.chain === 'solana';
                const pnlDisplay = isSolana ? pnlNative / 1e9 : pnlNative / 1e18;
                return (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0 cursor-pointer hover:opacity-80"
                    onClick={() => setLocation(`/token/${trade.tokenAddress}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-[var(--text-tertiary)] w-5">{i + 1}</span>
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{trade.tokenSymbol}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{trade.chain}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-[var(--accent-loss)]">
                        {formatNative(pnlDisplay, trade.chain as 'base' | 'solana')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Token Performance Table */}
        <Card className="card-raised p-5 mb-8">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle className="text-lg font-medium text-[var(--text-primary)]">
              Performance by Token
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left py-2 text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Token</th>
                  <th className="text-right py-2 text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Trades</th>
                  <th className="text-right py-2 text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Win Rate</th>
                  <th className="text-right py-2 text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Total P&L</th>
                  <th className="text-right py-2 text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Avg P&L</th>
                </tr>
              </thead>
              <tbody>
                {data.winRateByToken.map((token) => (
                  <tr
                    key={`${token.tokenAddress}-${token.chain}`}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] cursor-pointer"
                    onClick={() => setLocation(`/token/${token.tokenAddress}`)}
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text-primary)]">{token.tokenSymbol}</span>
                        <Badge variant="outline" className="text-[10px]">{token.chain}</Badge>
                      </div>
                    </td>
                    <td className="py-3 text-right font-mono text-sm text-[var(--text-secondary)]">{token.trades}</td>
                    <td className="py-3 text-right">
                      <span className={cn('font-mono text-sm', token.winRate >= 50 ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                        {formatPct(token.winRate)}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className={cn('font-mono text-sm', token.totalPnlNative >= 0 ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                        {token.totalPnlNative >= 0 ? '+' : ''}
                        {formatNative(token.totalPnlNative, token.chain as 'base' | 'solana')}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className={cn('font-mono text-sm', token.avgPnlNative >= 0 ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                        {token.avgPnlNative >= 0 ? '+' : ''}
                        {formatNative(token.avgPnlNative, token.chain as 'base' | 'solana')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Monthly Summary */}
        <Card className="card-raised p-5 mb-8">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle className="text-lg font-medium text-[var(--text-primary)]">
              Monthly Summary
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.monthlySummary.map((month) => (
              <div
                key={month.month}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4"
              >
                <p className="text-sm font-medium text-[var(--text-primary)] mb-3">
                  {new Date(month.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Trades</p>
                    <p className="font-mono text-sm text-[var(--text-secondary)]">{month.trades}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Win Rate</p>
                    <p className={cn('font-mono text-sm', month.winRate >= 50 ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                      {formatPct(month.winRate)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase">P&L</p>
                    <p className={cn('font-mono text-sm', month.totalPnlUsd >= 0 ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                      {month.totalPnlUsd >= 0 ? '+' : ''}
                      {formatUsdText(month.totalPnlUsd)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Chain Comparison */}
        {data.chainComparison.length > 1 && (
          <Card className="card-raised p-5">
            <CardHeader className="px-0 pt-0 pb-4">
              <CardTitle className="text-lg font-medium text-[var(--text-primary)]">
                Chain Comparison
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.chainComparison.map((chain) => (
                <div
                  key={chain.chain}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline">{chain.chain}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    <div>
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Trades</p>
                      <p className="font-mono text-sm text-[var(--text-secondary)]">{chain.trades}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Win Rate</p>
                      <p className={cn('font-mono text-sm', chain.winRate >= 50 ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                        {formatPct(chain.winRate)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase">P&L</p>
                      <p className={cn('font-mono text-sm', chain.totalPnlUsd >= 0 ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                        {chain.totalPnlUsd >= 0 ? '+' : ''}
                        {formatUsdText(chain.totalPnlUsd)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
