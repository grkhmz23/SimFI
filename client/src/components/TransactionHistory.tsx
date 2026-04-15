// client/src/components/TransactionHistory.tsx
// Transaction History Component - View detailed transaction history

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  ExternalLink, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock,
  CheckCircle,
  XCircle 
} from 'lucide-react';

export default function TransactionHistory() {
  const [address, setAddress] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [limit, setLimit] = useState(20);

  const { data, isLoading, error } = useQuery({
    queryKey: ['transaction-history', searchAddress, limit],
    queryFn: async () => {
      if (!searchAddress) return null;
      const res = await fetch(
        `/api/study/transactions/${searchAddress}?limit=${limit}`
      );
      const json = await res.json();
      
      // Check if this is a premium feature error response
      if (json.error === 'Premium feature') {
        return { isPremium: true, message: json.message };
      }
      
      if (!res.ok) throw new Error('Failed to fetch transaction history');
      return { isPremium: false, transactions: json };
    },
    enabled: !!searchAddress,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      setSearchAddress(address.trim());
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getTransactionType = (tx: any) => {
    const type = tx.type || 'UNKNOWN';
    const typeColors: Record<string, string> = {
      TRANSFER: 'bg-blue-500/10 text-blue-500',
      SWAP: 'bg-purple-500/10 text-purple-500',
      NFT_SALE: 'bg-green-500/10 text-green-500',
      NFT_MINT: 'bg-yellow-500/10 text-yellow-500',
      UNKNOWN: 'bg-gray-500/10 text-gray-500',
    };
    return {
      type,
      color: typeColors[type] || typeColors.UNKNOWN,
    };
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter wallet address or token mint"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading}>
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
        </div>

        {/* Limit Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show:</span>
          {[10, 20, 50, 100].map((num) => (
            <Button
              key={num}
              variant={limit === num ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLimit(num)}
              data-testid={`button-limit-${num}`}
            >
              {num}
            </Button>
          ))}
        </div>
      </form>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Failed to fetch transaction history. Please check the address and try again.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {/* Premium Feature Notice */}
      {data?.isPremium && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertDescription className="text-sm">
            <div className="font-semibold mb-2">Premium Feature Required</div>
            <div className="text-muted-foreground">{data.message}</div>
          </AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {data && !isLoading && !data.isPremium && (
        <div className="space-y-4">
          {/* Header */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                Showing {data.transactions?.length || 0} recent transactions
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Transaction List */}
          {data.transactions && data.transactions.length > 0 ? (
            <div className="space-y-3">
              {data.transactions.map((tx: any, idx: number) => {
                const txType = getTransactionType(tx);
                const isSuccess = tx.status === 'success' || !tx.status;

                return (
                  <Card key={idx} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Left Side - Type and Details */}
                        <div className="flex-1 space-y-2">
                          {/* Type Badge */}
                          <div className="flex items-center gap-2">
                            <Badge className={txType.color}>
                              {txType.type}
                            </Badge>
                            {isSuccess ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                          </div>

                          {/* Transaction Description */}
                          <div className="text-sm">
                            {tx.description || 'Transaction executed'}
                          </div>

                          {/* Signature */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">
                              {tx.signature?.slice(0, 16)}...{tx.signature?.slice(-16)}
                            </span>
                            <a
                              href={`https://solscan.io/tx/${tx.signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                              title="View on Explorer"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>

                          {/* Timestamp */}
                          {tx.timestamp && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {formatDate(tx.timestamp)}
                            </div>
                          )}

                          {/* Token Transfers if available */}
                          {tx.tokenTransfers && tx.tokenTransfers.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {tx.tokenTransfers.slice(0, 3).map((transfer: any, i: number) => (
                                <div
                                  key={i}
                                  className="text-xs bg-muted/50 rounded p-2 flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-2">
                                    {transfer.mint && (
                                      <span className="font-mono text-muted-foreground">
                                        {transfer.mint.slice(0, 6)}...
                                      </span>
                                    )}
                                    <span className="font-medium">
                                      {transfer.tokenAmount?.toFixed(4) || '0'}{' '}
                                      {transfer.symbol || 'tokens'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    {transfer.fromUserAccount === searchAddress ? (
                                      <>
                                        <ArrowUpRight className="w-3 h-3 text-red-500" />
                                        <span>Sent</span>
                                      </>
                                    ) : (
                                      <>
                                        <ArrowDownLeft className="w-3 h-3 text-green-500" />
                                        <span>Received</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {tx.tokenTransfers.length > 3 && (
                                <div className="text-xs text-muted-foreground text-center">
                                  +{tx.tokenTransfers.length - 3} more transfers
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Right Side - Fee */}
                        <div className="text-right text-sm">
                          <div className="text-muted-foreground text-xs mb-1">Fee</div>
                          <div className="font-mono">
                            {tx.fee ? (tx.fee / 1_000_000_000).toFixed(6) : '0'} SOL
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No transactions found for this address
              </CardContent>
            </Card>
          )}

          {/* Load More Button */}
          {data.transactions && data.transactions.length >= limit && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => setLimit(limit + 20)}
                data-testid="button-load-more"
              >
                Load More Transactions
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
