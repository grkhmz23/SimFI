import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useSolPrice } from '@/lib/price-context';
import { Link } from 'wouter';
import { formatSol, lamportsToSol, toBigInt, formatTokenAmount, formatPricePerTokenUSD, formatUSD } from '@/lib/lamports';
import { TrendingUp, TrendingDown, Package, LogIn, ExternalLink } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Position } from '@shared/schema';

export default function Portfolio() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const solPrice = useSolPrice();
  const [selectedPosition, setSelectedPosition] = useState<Position & { currentPrice: number } | null>(null);
  const { toast } = useToast();

  const { data: positionsData, isLoading, isError, error } = useQuery<{ positions: Position[] }>({
    queryKey: ['/api/trades/positions'],
    enabled: isAuthenticated,
    refetchInterval: 2500,
    refetchIntervalInBackground: true,
    staleTime: 2000,
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="min-h-[60vh] flex items-center justify-center">
          <Card className="p-12 text-center max-w-md">
            <LogIn className="h-16 w-16 mx-auto text-primary mb-6" />
            <h2 className="text-3xl font-bold mb-4">Login Required</h2>
            <p className="text-muted-foreground mb-8">
              You need to be logged in to view your portfolio and track your positions
            </p>
            <div className="flex gap-3">
              <Button
                variant="default"
                className="flex-1"
                onClick={() => setLocation('/login')}
                data-testid="button-goto-login"
              >
                Login
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setLocation('/register')}
                data-testid="button-goto-register"
              >
                Register
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const positions = (positionsData?.positions || []);

  // Group positions by tokenAddress
  const groupedPositions = positions.reduce((acc: Map<string, Position[]>, position: Position) => {
    const existing = acc.get(position.tokenAddress) || [];
    acc.set(position.tokenAddress, [...existing, position]);
    return acc;
  }, new Map<string, Position[]>());

  // ✅ NEW: Mutation for selling all positions using server-authoritative quotes
  const sellAllMutation = useMutation({
    mutationFn: async ({ tokenAddress, totalTokens }: { tokenAddress: string; totalTokens: bigint }) => {
      // Call sell-all directly - server handles price server-side
      console.log('💰 Executing sell-all for token:', tokenAddress);
      return await apiRequest('POST', '/api/trades/sell-all', { 
        tokenAddress,
        amountTokens: totalTokens.toString(),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/positions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      toast({
        title: 'All Positions Sold',
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Sell Failed',
        description: error.message || 'Failed to sell all positions',
        variant: 'destructive',
      });
    },
  });

  const handleSellAll = (tokenAddress: string, tokenPositions: Position[]) => {
    // Calculate total tokens across all positions for this token
    const totalTokens = tokenPositions.reduce((sum, p) => sum + toBigInt(p.amount), 0n);

    if (confirm('Are you sure you want to sell all positions of this token?')) {
      sellAllMutation.mutate({ tokenAddress, totalTokens });
    }
  };

  // Positions now include currentPrice from API
  const getPositionWithPrice = (position: any) => position;

  // Keep everything in BigInt until final display to prevent precision loss
  const calculateCurrentValueBigInt = (position: Position, currentPrice: number): bigint => {
    const amountBigInt = toBigInt(position.amount);
    const currentPriceBigInt = BigInt(Math.floor(currentPrice));
    const decimals = position.decimals || 6;
    const decimalDivisor = BigInt(10 ** decimals);

    return (amountBigInt * currentPriceBigInt) / decimalDivisor;
  };

  const calculateProfitLossBigInt = (position: Position, currentPrice: number): bigint => {
    const currentValue = calculateCurrentValueBigInt(position, currentPrice);
    const solSpent = toBigInt(position.solSpent);
    return currentValue - solSpent;
  };

  const calculateProfitLossPercent = (position: Position, currentPrice: number): number => {
    const pl = calculateProfitLossBigInt(position, currentPrice);
    const solSpent = toBigInt(position.solSpent);
    return (Number(pl) / Number(solSpent)) * 100;
  };

  // Use BigInt for totals to prevent precision loss
  const totalInvested = positions.reduce((sum: bigint, p: Position) => {
    return sum + toBigInt(p.solSpent);
  }, 0n);

  const totalCurrentValue = positions.reduce((sum: bigint, p: Position) => {
    const withPrice = getPositionWithPrice(p);
    return sum + calculateCurrentValueBigInt(p, withPrice.currentPrice);
  }, 0n);

  const totalPL = totalCurrentValue - totalInvested;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Portfolio</h1>
        <p className="text-muted-foreground">Track your open positions and performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-primary/10 p-3">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Invested</p>
              <p className="text-2xl font-bold font-mono">{formatUSD(totalInvested, 2)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-primary/10 p-3">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Value</p>
              <p className="text-2xl font-bold font-mono">{formatUSD(totalCurrentValue, 2)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className={`rounded-full p-3 ${totalPL >= 0n ? 'bg-success/10' : 'bg-destructive/10'}`}>
              {totalPL >= 0n ? (
                <TrendingUp className="h-6 w-6 text-success" />
              ) : (
                <TrendingDown className="h-6 w-6 text-destructive" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total P/L</p>
              <p className={`text-2xl font-bold font-mono ${totalPL >= 0n ? 'text-success' : 'text-destructive'}`}>
                {totalPL >= 0n ? '+' : ''}{formatUSD(totalPL, 2)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-semibold">Open Positions</h2>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Entry Price</TableHead>
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead className="text-right">Invested</TableHead>
                    <TableHead className="text-right">Current Value</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3].map((i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell><div className="h-8 bg-muted rounded w-24" /></TableCell>
                      <TableCell><div className="h-8 bg-muted rounded w-20 ml-auto" /></TableCell>
                      <TableCell><div className="h-8 bg-muted rounded w-24 ml-auto" /></TableCell>
                      <TableCell><div className="h-8 bg-muted rounded w-24 ml-auto" /></TableCell>
                      <TableCell><div className="h-8 bg-muted rounded w-20 ml-auto" /></TableCell>
                      <TableCell><div className="h-8 bg-muted rounded w-20 ml-auto" /></TableCell>
                      <TableCell><div className="h-8 bg-muted rounded w-20 ml-auto" /></TableCell>
                      <TableCell><div className="h-8 bg-muted rounded w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-xl text-muted-foreground mb-2" data-testid="text-no-positions">No open positions</p>
              <p className="text-sm text-muted-foreground mb-6">Start trading to see your positions here</p>
              <Link href="/">
                <Button data-testid="button-start-trading">Start Trading</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Entry Price</TableHead>
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead className="text-right">Invested</TableHead>
                    <TableHead className="text-right">Current Value</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((position: Position, index: number) => {
                    const positionWithPrice = getPositionWithPrice(position);
                    const currentValueBigInt = calculateCurrentValueBigInt(position, positionWithPrice.currentPrice);
                    const plBigInt = calculateProfitLossBigInt(position, positionWithPrice.currentPrice);
                    const plPercent = calculateProfitLossPercent(position, positionWithPrice.currentPrice);

                    // Check if this is the first position of a token with multiple positions
                    const tokenPositions = groupedPositions.get(position.tokenAddress) || [];
                    const isFirstOfMultiple = tokenPositions.length > 1 && tokenPositions[0].id === position.id;

                    return (
                      <TableRow key={position.id} data-testid={`row-position-${position.id}`}>
                        <TableCell>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-semibold text-foreground" data-testid={`text-token-symbol-${position.id}`}>{position.tokenSymbol}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-[200px]" data-testid={`text-token-name-${position.id}`}>
                                {position.tokenName}
                              </p>
                              {isFirstOfMultiple && (
                                <Badge variant="secondary" className="mt-1 text-xs">
                                  {tokenPositions.length} positions
                                </Badge>
                              )}
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => setLocation(`/token/${position.tokenAddress}`)}
                              data-testid={`button-view-token-${position.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono" data-testid={`text-amount-${position.id}`}>
                          {formatTokenAmount(position.amount, 2, position.decimals || 6)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm" data-testid={`text-entry-price-${position.id}`}>
                          {formatPricePerTokenUSD(position.entryPrice, 6, solPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm" data-testid={`text-current-price-${position.id}`}>
                          {formatPricePerTokenUSD(positionWithPrice.currentPrice, 6, solPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono" data-testid={`text-invested-${position.id}`}>
                          {formatUSD(position.solSpent, 2)}
                        </TableCell>
                        <TableCell className="text-right font-mono" data-testid={`text-value-${position.id}`}>
                          {formatUSD(currentValueBigInt, 2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={`font-mono font-semibold ${plBigInt >= 0n ? 'text-success' : 'text-destructive'}`} data-testid={`text-pnl-${position.id}`}>
                              {plBigInt >= 0n ? '+' : ''}{formatUSD(plBigInt, 2)}
                            </span>
                            <Badge 
                              variant={plBigInt >= 0n ? 'default' : 'destructive'}
                              className="text-xs"
                              data-testid={`badge-pnl-percent-${position.id}`}
                            >
                              {plBigInt >= 0n ? '+' : ''}{plPercent.toFixed(2)}%
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => setSelectedPosition(positionWithPrice)}
                              data-testid={`button-buy-more-${position.id}`}
                            >
                              Buy More
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setSelectedPosition(positionWithPrice)}
                              data-testid={`button-sell-${position.id}`}
                            >
                              Sell
                            </Button>
                            {isFirstOfMultiple && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSellAll(position.tokenAddress, tokenPositions)}
                                disabled={sellAllMutation.isPending}
                                data-testid={`button-sell-all-${position.tokenAddress}`}
                              >
                                {sellAllMutation.isPending ? 'Selling...' : `Sell All (${tokenPositions.length})`}
                              </Button>
                            )}
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

      {selectedPosition && (
        <TradeModal
          position={selectedPosition}
          onClose={() => setSelectedPosition(null)}
        />
      )}
    </div>
  );
}