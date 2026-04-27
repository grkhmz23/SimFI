import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell } from '@/components/ui/data-cell';
import { TradeModal } from '@/components/TradeModal';
import { useAuth } from '@/lib/auth-context';
import { usePrice } from '@/lib/price-context';
import { useChain } from '@/lib/chain-context';
import {
  formatUsd,
  formatUsdText,
  formatTokenQty,
  formatNative,
  formatPct,
} from '@/lib/format';
import {
  lamportsToSol,
  weiToEth,
  toBigInt,
} from '@/lib/token-format';
import { cn } from '@/lib/utils';
import type { Position } from '@shared/schema';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingCart,
  DollarSign,
  ExternalLink,
  BarChart3,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

interface EnrichedPosition extends Position {
  currentPrice: string;
  currentValue: string;
}

/* ------------------------------------------------------------------ */
//  Animation constants
/* ------------------------------------------------------------------ */

const ease = [0.16, 1, 0.3, 1] as const;

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease },
  }),
};

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

function toNativeNumber(value: bigint, chain: 'solana' | 'base'): number {
  return chain === 'solana' ? lamportsToSol(value) : weiToEth(value);
}

/* ------------------------------------------------------------------ */
//  Page
/* ------------------------------------------------------------------ */

export default function Positions() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { activeChain } = useChain();
  const { getPrice } = usePrice();
  const nativePrice = getPrice(activeChain) ?? NaN;

  const [tradeModal, setTradeModal] = useState<{
    position: EnrichedPosition;
    mode: 'buy' | 'sell';
  } | null>(null);

  /* ------------------- Data fetching ------------------- */

  const { data: positionsData, isLoading } = useQuery<{ positions: EnrichedPosition[] }>({
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

  const positions = positionsData?.positions ?? [];

  /* ------------------- Computed ------------------- */

  const totalValue = positions.reduce(
    (sum, p) => sum + toBigInt(p.currentValue),
    0n
  );
  const totalInvested = positions.reduce(
    (sum, p) => sum + toBigInt(p.solSpent),
    0n
  );
  const totalPnL = totalValue - totalInvested;
  const totalPnLPercent =
    totalInvested > 0n ? (Number(totalPnL) / Number(totalInvested)) * 100 : 0;

  const totalValueNative = toNativeNumber(totalValue, activeChain);
  const totalInvestedNative = toNativeNumber(totalInvested, activeChain);
  const totalPnLNative = toNativeNumber(totalPnL, activeChain);

  /* ------------------- Unauthenticated ------------------- */

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="card-raised p-12 text-center max-w-md">
          <Wallet className="h-12 w-12 mx-auto text-[var(--text-secondary)] mb-4" />
          <h1 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">
            Login Required
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">
            You need to be logged in to view your positions
          </p>
          <Link href="/login">
            <Button>Login</Button>
          </Link>
        </Card>
      </div>
    );
  }

  /* ------------------- Render ------------------- */

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-page-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-4xl font-medium text-[var(--text-primary)] mb-2">
          Your Positions
        </h1>
        <p className="text-[var(--text-secondary)]">
          Manage your open trades
        </p>
      </div>

      {/* Portfolio Summary */}
      {positions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mb-8"
        >
          <Card className="card-raised">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <BarChart3 className="h-5 w-5" strokeWidth={1.5} />
                <span className="font-medium">Portfolio Summary</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Total Positions</p>
                  <p className="font-mono text-2xl font-medium text-[var(--text-primary)] tabular-nums">
                    {positions.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Total Invested</p>
                  <p className="font-mono text-2xl font-medium text-[var(--text-primary)] tabular-nums">
                    {formatNative(totalInvestedNative, activeChain)}
                  </p>
                  <p className="font-mono text-sm text-[var(--text-tertiary)] tabular-nums">
                    {formatUsdText(totalInvestedNative * nativePrice)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Current Value</p>
                  <p className="font-mono text-2xl font-medium text-[var(--text-primary)] tabular-nums">
                    {formatNative(totalValueNative, activeChain)}
                  </p>
                  <p className="font-mono text-sm text-[var(--text-tertiary)] tabular-nums">
                    {formatUsdText(totalValueNative * nativePrice)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">Total P&L</p>
                  <div className="flex items-baseline gap-2">
                    <p
                      className={cn(
                        'font-mono text-2xl font-medium tabular-nums',
                        totalPnLNative >= 0
                          ? 'text-[var(--accent-gain)]'
                          : 'text-[var(--accent-loss)]'
                      )}
                    >
                      {totalPnLNative >= 0 ? '+' : ''}
                      {formatNative(totalPnLNative, activeChain)}
                    </p>
                    <Badge variant={totalPnLNative >= 0 ? 'gain' : 'loss'}>
                      {formatPct(totalPnLPercent)}
                    </Badge>
                  </div>
                  <p
                    className={cn(
                      'font-mono text-sm tabular-nums',
                      totalPnLNative >= 0
                        ? 'text-[var(--accent-gain)]'
                        : 'text-[var(--accent-loss)]'
                    )}
                  >
                    {totalPnLNative >= 0 ? '+' : ''}
                    {formatUsdText(totalPnLNative * nativePrice)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Positions Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="card-raised p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </Card>
          ))}
        </div>
      ) : positions.length === 0 ? (
        <Card className="card-raised p-12 text-center">
          <Wallet className="h-16 w-16 mx-auto text-[var(--text-tertiary)] mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">
            No Open Positions
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            You don't have any open positions yet. Start trading to build your portfolio!
          </p>
          <Link href="/">
            <Button className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Start Trading
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {positions.map((position, index) => {
            const currentValue = toBigInt(position.currentValue);
            const spent = toBigInt(position.solSpent);
            const pnl = currentValue - spent;
            const pnlPercent =
              spent > 0n ? (Number(pnl) / Number(spent)) * 100 : 0;
            const isGain = pnl >= 0n;

            const spentNative = toNativeNumber(spent, activeChain);
            const currentValueNative = toNativeNumber(currentValue, activeChain);
            const pnlNative = toNativeNumber(pnl, activeChain);

            const entryPriceNative = toNativeNumber(
              toBigInt(position.entryPrice),
              activeChain
            );
            const currentPriceNative = toNativeNumber(
              toBigInt(position.currentPrice),
              activeChain
            );
            const entryPriceUsd = entryPriceNative * nativePrice;
            const currentPriceUsd = currentPriceNative * nativePrice;

            const tokenQty =
              Number(toBigInt(position.amount)) /
              10 ** (position.decimals ?? 6);

            return (
              <motion.div
                key={position.id}
                custom={index}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                <Card
                  className="card-raised h-full flex flex-col"
                  data-testid={`card-position-${position.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3
                          className="text-xl font-bold text-[var(--text-primary)] truncate"
                          data-testid={`text-token-symbol-${position.id}`}
                        >
                          {position.tokenSymbol}
                        </h3>
                        <p
                          className="text-sm text-[var(--text-secondary)] truncate"
                          data-testid={`text-token-name-${position.id}`}
                        >
                          {position.tokenName}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() =>
                          setLocation(`/token/${position.tokenAddress}`)
                        }
                        data-testid={`button-view-token-${position.id}`}
                      >
                        <ExternalLink className="h-4 w-4 text-[var(--text-tertiary)]" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col gap-4">
                    {/* Price & Holdings */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">
                          Holdings
                        </span>
                        <DataCell
                          value={formatTokenQty(tokenQty)}
                          data-testid={`text-holdings-${position.id}`}
                        />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">
                          Entry Price
                        </span>
                        <span
                          className="font-mono text-[var(--text-secondary)] tabular-nums"
                          data-testid={`text-entry-nativePrice-${position.id}`}
                        >
                          {formatUsd(entryPriceUsd)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">
                          Current Price
                        </span>
                        <span
                          className="font-mono text-[var(--text-primary)] tabular-nums"
                          data-testid={`text-current-nativePrice-${position.id}`}
                        >
                          {formatUsd(currentPriceUsd)}
                        </span>
                      </div>
                    </div>

                    {/* Value */}
                    <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">
                          Invested
                        </span>
                        <div className="text-right">
                          <DataCell
                            value={formatNative(spentNative, activeChain)}
                            variant="secondary"
                            data-testid={`text-invested-${position.id}`}
                          />
                          <p className="font-mono text-xs text-[var(--text-tertiary)]">
                            {formatUsdText(
                              spentNative * nativePrice
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">
                          Current Value
                        </span>
                        <div className="text-right">
                          <DataCell
                            value={formatNative(
                              currentValueNative,
                              activeChain
                            )}
                            data-testid={`text-value-${position.id}`}
                          />
                          <p className="font-mono text-xs text-[var(--text-tertiary)]">
                            {formatUsdText(
                              currentValueNative * nativePrice
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* P&L */}
                    <div className="border-t border-[var(--border-subtle)] pt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-[var(--text-secondary)]">
                          Profit / Loss
                        </span>
                        {isGain ? (
                          <TrendingUp className="h-4 w-4 text-[var(--accent-gain)]" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-[var(--accent-loss)]" />
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <DataCell
                          value={formatNative(pnlNative, activeChain)}
                          prefix={isGain ? '+' : ''}
                          variant={isGain ? 'gain' : 'loss'}
                          className="text-xl font-bold"
                          data-testid={`text-pnl-${position.id}`}
                        />
                        <Badge
                          variant={isGain ? 'gain' : 'loss'}
                          data-testid={`badge-pnl-percent-${position.id}`}
                        >
                          {formatPct(pnlPercent)}
                        </Badge>
                      </div>
                      <p
                        className={cn(
                          'font-mono text-xs tabular-nums mt-0.5',
                          isGain
                            ? 'text-[var(--accent-gain)]'
                            : 'text-[var(--accent-loss)]'
                        )}
                      >
                        {isGain ? '+' : ''}
                        {formatUsdText(
                          pnlNative * nativePrice
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 mt-auto">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() =>
                          setTradeModal({ position, mode: 'buy' })
                        }
                        data-testid={`button-buy-more-${position.id}`}
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Buy More
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 border-[var(--accent-loss)] text-[var(--accent-loss)] hover:bg-[var(--accent-loss)]/10"
                        onClick={() =>
                          setTradeModal({ position, mode: 'sell' })
                        }
                        data-testid={`button-sell-${position.id}`}
                      >
                        <DollarSign className="h-4 w-4" />
                        Sell
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

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
