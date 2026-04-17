import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNative, formatUSD, formatPricePerTokenUSD } from '@/lib/token-format';
import { useChain } from '@/lib/chain-context';
import { History as HistoryIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Trade } from '@shared/schema';

interface HistoryResponse {
  trades: Trade[];
  pagination: {
    page: number;
    totalPages: number;
    total: number;
  };
}

export default function History() {
  const [page, setPage] = useState(1);
  const { activeChain, nativeSymbol } = useChain();

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

  const trades = data?.trades || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Trade History</h1>
        <p className="text-muted-foreground">View all your completed trades</p>
      </div>

      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">Closed Positions</h2>
            <p className="text-sm text-muted-foreground">
              Total: {pagination.total} trades
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading trade history...</p>
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center py-12">
              <HistoryIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-xl text-muted-foreground mb-2">No trade history</p>
              <p className="text-sm text-muted-foreground">Your completed trades will appear here</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Exit</TableHead>
                      <TableHead className="text-right">Invested</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Closed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade: Trade) => {
                      const plPercent = trade.nativeSpent > 0n
                        ? (Number(trade.profitLoss) / Number(trade.nativeSpent)) * 100
                        : 0;
                      
                      return (
                        <TableRow key={trade.id} data-testid={`row-trade-${trade.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-semibold text-foreground">{trade.tokenSymbol}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {trade.tokenName}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {(Number(trade.amount) / 1_000_000_000).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatPricePerTokenUSD(trade.entryPrice, 6)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatPricePerTokenUSD(trade.exitPrice, 6)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatUSD(trade.nativeSpent, 2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatUSD(trade.nativeReceived, 2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end">
                              <span 
                                className={`font-mono font-semibold ${trade.profitLoss >= 0 ? 'text-success' : 'text-destructive'}`}
                                data-testid={`text-pl-${trade.id}`}
                              >
                                {trade.profitLoss >= 0 ? '+' : ''}{formatUSD(trade.profitLoss, 2)}
                              </span>
                              <Badge 
                                variant={trade.profitLoss >= 0 ? 'default' : 'destructive'}
                                className="text-xs"
                              >
                                {trade.profitLoss >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(trade.openedAt.toString())}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(trade.closedAt.toString())}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={pagination.page === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
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
    </div>
  );
}
