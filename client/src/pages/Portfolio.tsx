import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell } from '@/components/ui/data-cell';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TradeModal } from '@/components/TradeModal';
import { useAuth } from '@/lib/auth-context';
import { usePrice } from '@/lib/price-context';
import { useChain } from '@/lib/chain-context';
import {
  formatNative,
  formatUSD,
  formatTokenAmount,
  formatPricePerTokenUSD,
  toBigInt,
} from '@/lib/token-format';
import { cn } from '@/lib/utils';
import type { Position, Trade } from '@shared/schema';
import {
  TrendingUp,
  TrendingDown,
  Package,
  LogIn,
  ExternalLink,
  ArrowUpDown,
  Wallet,
  Ban,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

interface EnrichedPosition extends Position {
  currentPrice: string;
  currentValue: string;
}

interface AnalyticsResponse {
  balanceHistory: { date: string; balance: number }[];
  winCount: number;
  lossCount: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  dailyPnl: { date: string; pnl: number }[];
}

type SortKey =
  | 'tokenSymbol'
  | 'entryPrice'
  | 'currentPrice'
  | 'amount'
  | 'currentValue'
  | 'pnl';

interface SortState {
  key: SortKey;
  direction: 'asc' | 'desc';
}

/* ------------------------------------------------------------------ */
//  Animation constants
/* ------------------------------------------------------------------ */

const ease = [0.16, 1, 0.3, 1] as const;

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease },
  }),
};

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

function calculatePnL(position: EnrichedPosition): bigint {
  const currentValue = toBigInt(position.currentValue);
  const spent = toBigInt(position.solSpent);
  return currentValue - spent;
}

function calculatePnLPercent(position: EnrichedPosition): number {
  const spent = toBigInt(position.solSpent);
  if (spent === 0n) return 0;
  const pnl = calculatePnL(position);
  return (Number(pnl) / Number(spent)) * 100;
}

function formatHoldTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/* ------------------------------------------------------------------ */
//  Balance Chart
/* ------------------------------------------------------------------ */

function BalanceChart({ data }: { data: { date: string; balance: number }[] }) {
  const { activeChain, nativeSymbol } = useChain();

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) =>
              new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            }
            stroke="var(--text-tertiary)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
          />
          <YAxis
            stroke="var(--text-tertiary)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v.toFixed(2)}`}
            width={48}
          />
          <RechartsTooltip
            contentStyle={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--text-secondary)' }}
            formatter={(v: number) => [
              `${v.toFixed(4)} ${nativeSymbol}`,
              'Balance',
            ]}
            labelFormatter={(l: string) =>
              new Date(l).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            }
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="var(--accent-premium)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--accent-premium)', stroke: 'var(--bg-base)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
//  Page
/* ------------------------------------------------------------------ */

export default function Portfolio() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { activeChain, nativeSymbol } = useChain();
  const { getPrice } = usePrice();

  const [sort, setSort] = useState<SortState>({ key: 'currentValue', direction: 'desc' });
  const [tradeModal, setTradeModal] = useState<{
    position: EnrichedPosition;
    mode: 'buy' | 'sell';
  } | null>(null);

  /* ------------------- Data fetching ------------------- */

  const {
    data: positionsData,
    isLoading: positionsLoading,
    isError: positionsError,
  } = useQuery<{ positions: EnrichedPosition[] }>({
    queryKey: ['/api/trades/positions', activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/trades/positions?chain=${activeChain}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch positions');
      return res.json();
    },
    enabled: isAuthenticated,
    refetchInterval: 2500,
    refetchIntervalInBackground: true,
    staleTime: 2000,
  });

  const { data: analyticsData } = useQuery<AnalyticsResponse>({
    queryKey: ['/api/portfolio/analytics', activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/portfolio/analytics?chain=${activeChain}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 300_000,
  });

  /* ------------------- Computed ------------------- */

  const positions = positionsData?.positions ?? [];

  const totals = useMemo(() => {
    let invested = 0n;
    let current = 0n;
    for (const p of positions) {
      invested += toBigInt(p.solSpent);
      current += toBigInt(p.currentValue);
    }
    return { invested, current, pnl: current - invested };
  }, [positions]);

  const winRate = useMemo(() => {
    if (!analyticsData) return 0;
    const total = analyticsData.winCount + analyticsData.lossCount;
    return total > 0 ? (analyticsData.winCount / total) * 100 : 0;
  }, [analyticsData]);

  const sortedPositions = useMemo(() => {
    const list = [...positions];
    list.sort((a, b) => {
      let va: bigint | number | string;
      let vb: bigint | number | string;

      switch (sort.key) {
        case 'tokenSymbol':
          va = a.tokenSymbol.toLowerCase();
          vb = b.tokenSymbol.toLowerCase();
          break;
        case 'entryPrice':
          va = Number(a.entryPrice);
          vb = Number(b.entryPrice);
          break;
        case 'currentPrice':
          va = Number(a.currentPrice);
          vb = Number(b.currentPrice);
          break;
        case 'amount':
          va = toBigInt(a.amount);
          vb = toBigInt(b.amount);
          break;
        case 'currentValue':
          va = toBigInt(a.currentValue);
          vb = toBigInt(b.currentValue);
          break;
        case 'pnl':
          va = calculatePnL(a);
          vb = calculatePnL(b);
          break;
        default:
          return 0;
      }

      if (typeof va === 'bigint' && typeof vb === 'bigint') {
        return sort.direction === 'asc'
          ? va < vb
            ? -1
            : 1
          : va > vb
            ? -1
            : 1;
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sort.direction === 'asc' ? va - vb : vb - va;
      }
      return sort.direction === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return list;
  }, [positions, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  /* ------------------- Unauthenticated ------------------- */

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="min-h-[60vh] flex items-center justify-center">
          <Card className="card-raised p-12 text-center max-w-md">
            <LogIn className="h-16 w-16 mx-auto text-[var(--text-secondary)] mb-6" />
            <h2 className="text-3xl font-bold mb-4 text-[var(--text-primary)]">Login Required</h2>
            <p className="text-[var(--text-secondary)] mb-8">
              You need to be logged in to view your portfolio and track your positions
            </p>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => setLocation('/login')}>
                Login
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setLocation('/register')}>
                Register
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  /* ------------------- Render ------------------- */

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-page-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-4xl font-medium text-[var(--text-primary)] mb-2">
          Portfolio
        </h1>
        <p className="text-[var(--text-secondary)]">
          Track your open positions and performance
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Value */}
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="card-raised p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-[var(--accent-premium)]/10 p-2">
                <Wallet className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
              </div>
              <span className="text-sm text-[var(--text-secondary)]">Total Value</span>
            </div>
            <div className="font-mono text-2xl font-medium text-[var(--text-primary)] tabular-nums">
              {formatNative(totals.current, activeChain, 4)} {nativeSymbol}
            </div>
            <div className="font-mono text-sm text-[var(--text-tertiary)] tabular-nums mt-1">
              {formatUSD(totals.current, getPrice(activeChain), activeChain, 2)}
            </div>
          </Card>
        </motion.div>

        {/* Total Invested */}
        <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="card-raised p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-[var(--text-secondary)]/10 p-2">
                <Package className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
              </div>
              <span className="text-sm text-[var(--text-secondary)]">Total Invested</span>
            </div>
            <div className="font-mono text-2xl font-medium text-[var(--text-primary)] tabular-nums">
              {formatNative(totals.invested, activeChain, 4)} {nativeSymbol}
            </div>
            <div className="font-mono text-sm text-[var(--text-tertiary)] tabular-nums mt-1">
              {formatUSD(totals.invested, getPrice(activeChain), activeChain, 2)}
            </div>
          </Card>
        </motion.div>

        {/* Total P&L */}
        <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="card-raised p-5">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={cn(
                  'rounded-lg p-2',
                  totals.pnl >= 0n ? 'bg-[var(--accent-gain)]/10' : 'bg-[var(--accent-loss)]/10'
                )}
              >
                {totals.pnl >= 0n ? (
                  <TrendingUp className="h-5 w-5 text-[var(--accent-gain)]" strokeWidth={1.5} />
                ) : (
                  <TrendingDown className="h-5 w-5 text-[var(--accent-loss)]" strokeWidth={1.5} />
                )}
              </div>
              <span className="text-sm text-[var(--text-secondary)]">Total Unrealized P&L</span>
            </div>
            <div
              className={cn(
                'font-mono text-2xl font-medium tabular-nums',
                totals.pnl >= 0n ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]'
              )}
            >
              {totals.pnl >= 0n ? '+' : ''}
              {formatNative(totals.pnl, activeChain, 4)} {nativeSymbol}
            </div>
            <div
              className={cn(
                'font-mono text-sm tabular-nums mt-1',
                totals.pnl >= 0n ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]'
              )}
            >
              {totals.pnl >= 0n ? '+' : ''}
              {formatUSD(totals.pnl, getPrice(activeChain), activeChain, 2)}
            </div>
          </Card>
        </motion.div>

        {/* Win Rate */}
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <Card className="card-raised p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-[var(--accent-premium)]/10 p-2">
                <TrendingUp className="h-5 w-5 text-[var(--accent-premium)]" strokeWidth={1.5} />
              </div>
              <span className="text-sm text-[var(--text-secondary)]">Win Rate</span>
            </div>
            <div className="font-mono text-2xl font-medium text-[var(--text-primary)] tabular-nums">
              {winRate.toFixed(1)}%
            </div>
            <div className="font-mono text-sm text-[var(--text-tertiary)] tabular-nums mt-1">
              {analyticsData?.winCount ?? 0}W / {analyticsData?.lossCount ?? 0}L
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Balance Chart */}
      {analyticsData && analyticsData.balanceHistory.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mb-8"
        >
          <Card className="card-raised p-5">
            <h3 className="font-serif text-lg font-medium text-[var(--text-primary)] mb-4">
              Balance Over Time
            </h3>
            <BalanceChart data={analyticsData.balanceHistory} />
          </Card>
        </motion.div>
      )}

      {/* Open Positions Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease }}
      >
        <Card className="card-raised overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h2 className="font-serif text-lg font-medium text-[var(--text-primary)]">
              Open Positions
            </h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" disabled className="gap-2">
                    <Ban className="h-3.5 w-3.5" />
                    Sell All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Sell-all temporarily disabled</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="p-4">
            {positionsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-10 w-24 ml-auto" />
                    <Skeleton className="h-10 w-24 ml-auto" />
                    <Skeleton className="h-10 w-24 ml-auto" />
                    <Skeleton className="h-10 w-24 ml-auto" />
                    <Skeleton className="h-10 w-24 ml-auto" />
                    <Skeleton className="h-10 w-20 ml-auto" />
                  </div>
                ))}
              </div>
            ) : positionsError ? (
              <div className="text-center py-12">
                <p className="text-[var(--text-secondary)]">Failed to load positions</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-16 w-16 mx-auto text-[var(--text-tertiary)] mb-4" />
                <p className="text-xl text-[var(--text-secondary)] mb-2">No open positions</p>
                <p className="text-sm text-[var(--text-tertiary)] mb-6">
                  Start trading to see your positions here
                </p>
                <Link href="/">
                  <Button>Start Trading</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[var(--border-subtle)] hover:bg-transparent">
                      <TableHead className="text-[var(--text-secondary)]">
                        <button
                          onClick={() => handleSort('tokenSymbol')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
                        >
                          Token
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        <button
                          onClick={() => handleSort('entryPrice')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                        >
                          Entry
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        <button
                          onClick={() => handleSort('currentPrice')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                        >
                          Current
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        <button
                          onClick={() => handleSort('amount')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                        >
                          Qty
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        <button
                          onClick={() => handleSort('currentValue')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                        >
                          Value
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        <button
                          onClick={() => handleSort('pnl')}
                          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                        >
                          Unrealized P&L
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPositions.map((position) => {
                      const pnl = calculatePnL(position);
                      const pnlPercent = calculatePnLPercent(position);
                      const isGain = pnl >= 0n;

                      return (
                        <TableRow
                          key={position.id}
                          className="border-b border-[var(--border-subtle)] table-row-hover"
                          data-testid={`row-position-${position.id}`}
                        >
                          <TableCell>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p
                                  className="font-medium text-[var(--text-primary)]"
                                  data-testid={`text-token-symbol-${position.id}`}
                                >
                                  {position.tokenSymbol}
                                </p>
                                <p
                                  className="text-sm text-[var(--text-secondary)] truncate max-w-[200px]"
                                  data-testid={`text-token-name-${position.id}`}
                                >
                                  {position.tokenName}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                                onClick={() => setLocation(`/token/${position.tokenAddress}`)}
                                data-testid={`button-view-token-${position.id}`}
                              >
                                <ExternalLink className="h-4 w-4 text-[var(--text-tertiary)]" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DataCell
                              value={formatPricePerTokenUSD(Number(position.entryPrice), 6)}
                              variant="secondary"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <DataCell
                              value={formatPricePerTokenUSD(Number(position.currentPrice), 6)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <DataCell
                              value={formatTokenAmount(
                                toBigInt(position.amount),
                                position.decimals || 6,
                                2
                              )}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <DataCell
                                value={formatNative(
                                  toBigInt(position.currentValue),
                                  activeChain,
                                  4
                                )}
                                suffix={` ${nativeSymbol}`}
                              />
                              <span className="font-mono text-xs text-[var(--text-tertiary)]">
                                {formatUSD(
                                  toBigInt(position.currentValue),
                                  getPrice(activeChain),
                                  activeChain,
                                  2
                                )}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <DataCell
                                value={formatNative(pnl, activeChain, 4)}
                                prefix={isGain ? '+' : ''}
                                suffix={` ${nativeSymbol}`}
                                variant={isGain ? 'gain' : 'loss'}
                              />
                              <Badge variant={isGain ? 'gain' : 'loss'} className="text-xs">
                                {isGain ? '+' : ''}
                                {pnlPercent.toFixed(2)}%
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() =>
                                  setTradeModal({ position, mode: 'buy' })
                                }
                                data-testid={`button-buy-more-${position.id}`}
                              >
                                Buy
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[var(--accent-loss)] text-[var(--accent-loss)] hover:bg-[var(--accent-loss)]/10"
                                onClick={() =>
                                  setTradeModal({ position, mode: 'sell' })
                                }
                                data-testid={`button-sell-${position.id}`}
                              >
                                Sell
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Trade Modal */}
      {tradeModal && (
        <TradeModal
          position={tradeModal.position}
          mode={tradeModal.mode}
          onClose={() => setTradeModal(null)}
        />
      )}
    </div>
  );
}
