import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell } from '@/components/ui/data-cell';
import { ChainChip } from '@/components/ui/chain-chip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  lamportsToSol,
  weiToEth,
  toBigInt,
} from '@/lib/token-format';
import {
  formatUsd,
  formatUsdText,
  formatTokenQty,
  formatNative,
  formatPct,
} from '@/lib/format';
import { useChain } from '@/lib/chain-context';
import { usePrice } from '@/lib/price-context';
import { History as HistoryIcon, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import type { Trade } from '@shared/schema';
import { TradeShareModal } from '@/components/TradeShareModal';

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

interface HistoryResponse {
  trades: Trade[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

function formatDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return (
    date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' ' +
    date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

function calculateHoldTime(opened: string | Date, closed: string | Date): string {
  const open = typeof opened === 'string' ? new Date(opened) : opened;
  const close = typeof closed === 'string' ? new Date(closed) : closed;
  const ms = close.getTime() - open.getTime();
  if (ms <= 0) return '0m';

  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/* ------------------------------------------------------------------ */
//  Page
/* ------------------------------------------------------------------ */

export default function History() {
  const [page, setPage] = useState(1);
  const [shareTrade, setShareTrade] = useState<Trade | null>(null);
  const { activeChain, nativeSymbol } = useChain();
  const { getPrice } = usePrice();

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ['/api/trades/history', page, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/trades/history?page=${page}&chain=${activeChain}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
  });

  const trades = data?.trades ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 1 };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-page-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-4xl font-medium text-[var(--text-primary)] mb-2">
          Trade History
        </h1>
        <p className="text-[var(--text-secondary)]">View all your completed trades</p>
      </div>

      <Card className="card-raised overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-lg font-medium text-[var(--text-primary)]">
              Closed Positions
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Total: {pagination.total} trades
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-10 w-24 ml-auto" />
                  <Skeleton className="h-10 w-24 ml-auto" />
                  <Skeleton className="h-10 w-24 ml-auto" />
                  <Skeleton className="h-10 w-24 ml-auto" />
                  <Skeleton className="h-10 w-20 ml-auto" />
                  <Skeleton className="h-10 w-20 ml-auto" />
                </div>
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center py-12">
              <HistoryIcon className="h-16 w-16 mx-auto text-[var(--text-tertiary)] mb-4" />
              <p className="text-xl text-[var(--text-secondary)] mb-2">No trade history</p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Your completed trades will appear here
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[var(--border-subtle)] hover:bg-transparent">
                      <TableHead className="text-[var(--text-secondary)]">Token</TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        Entry
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        Exit
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        Qty
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        P&L
                      </TableHead>
                      <TableHead className="text-right text-[var(--text-secondary)]">
                        Hold Time
                      </TableHead>
                      <TableHead className="text-[var(--text-secondary)]">Chain</TableHead>
                      <TableHead className="text-[var(--text-secondary)]">Closed</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => {
                      const pl = toBigInt(trade.profitLoss);
                      const spent = toBigInt(trade.solSpent);
                      const plPercent = spent > 0n ? (Number(pl) / Number(spent)) * 100 : 0;
                      const isGain = pl >= 0n;

                      const plNative =
                        trade.chain === 'solana'
                          ? lamportsToSol(pl)
                          : weiToEth(pl);
                      const plUsd =
                        plNative * (getPrice(trade.chain as 'base' | 'solana') ?? 0);

                      const entryPriceNative =
                        trade.chain === 'solana'
                          ? lamportsToSol(toBigInt(trade.entryPrice))
                          : weiToEth(toBigInt(trade.entryPrice));
                      const entryPriceUsd =
                        entryPriceNative * (getPrice(trade.chain as 'base' | 'solana') ?? 0);

                      const exitPriceNative =
                        trade.chain === 'solana'
                          ? lamportsToSol(toBigInt(trade.exitPrice))
                          : weiToEth(toBigInt(trade.exitPrice));
                      const exitPriceUsd =
                        exitPriceNative * (getPrice(trade.chain as 'base' | 'solana') ?? 0);

                      const tokenQty =
                        Number(toBigInt(trade.amount)) /
                        10 ** (trade.decimals || 6);

                      return (
                        <TableRow
                          key={trade.id}
                          className="border-b border-[var(--border-subtle)] table-row-hover"
                          data-testid={`row-trade-${trade.id}`}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium text-[var(--text-primary)]">
                                {trade.tokenSymbol}
                              </p>
                              <p className="text-sm text-[var(--text-secondary)] truncate max-w-[200px]">
                                {trade.tokenName}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DataCell
                              value={formatUsdText(entryPriceUsd)}
                              variant="secondary"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <DataCell value={formatUsdText(exitPriceUsd)} />
                          </TableCell>
                          <TableCell className="text-right">
                            <DataCell value={formatTokenQty(tokenQty)} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <DataCell
                                value={formatNative(
                                  plNative,
                                  trade.chain as 'base' | 'solana'
                                )}
                                prefix={isGain ? '+' : ''}
                                variant={isGain ? 'gain' : 'loss'}
                                data-testid={`text-pl-${trade.id}`}
                              />
                              <Badge variant={isGain ? 'gain' : 'loss'} className="text-xs">
                                {formatPct(plPercent)}
                              </Badge>
                              <span
                                className={
                                  'font-mono text-xs tabular-nums text-[var(--text-tertiary)]'
                                }
                              >
                                {isGain ? '+' : ''}
                                {formatUsdText(plUsd)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DataCell
                              value={calculateHoldTime(trade.openedAt, trade.closedAt)}
                              variant="secondary"
                            />
                          </TableCell>
                          <TableCell>
                            <ChainChip chain={trade.chain as 'base' | 'solana'} />
                          </TableCell>
                          <TableCell className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
                            {formatDate(trade.closedAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setShareTrade(trade)}
                              title="Share trade card"
                            >
                              <Share2 className="h-4 w-4 text-[var(--text-secondary)]" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={pagination.page === pagination.totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
      <TradeShareModal
        trade={shareTrade}
        nativePrice={getPrice(shareTrade?.chain as 'base' | 'solana') ?? 0}
        open={!!shareTrade}
        onOpenChange={(open) => !open && setShareTrade(null)}
      />
    </div>
  );
}
