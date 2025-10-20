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
import { useTokens } from '@/lib/websocket';
import { formatSol, lamportsToSol } from '@/lib/lamports';
import { TrendingUp, TrendingDown, Package, LogIn } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Position } from '@shared/schema';

export default function Portfolio() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPosition, setSelectedPosition] = useState<Position & { currentPrice: number } | null>(null);
  const { toast } = useToast();

  const { data: positionsData, isLoading } = useQuery<{ positions: Position[] }>({
    queryKey: ['/api/trades/positions'],
    enabled: isAuthenticated,
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

  const { getPrice } = useTokens();

  // Group positions by tokenAddress
  const groupedPositions = positions.reduce((acc: Map<string, Position[]>, position: Position) => {
    const existing = acc.get(position.tokenAddress) || [];
    acc.set(position.tokenAddress, [...existing, position]);
    return acc;
  }, new Map<string, Position[]>());

  // Mutation for selling all positions of a token
  const sellAllMutation = useMutation({
    mutationFn: async ({ tokenAddress, exitPrice }: { tokenAddress: string; exitPrice: number }) => {
      return await apiRequest('/api/trades/sell-all', 'POST', { tokenAddress, exitPrice });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/positions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
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

  const handleSellAll = (tokenAddress: string, currentPrice: number) => {
    if (confirm('Are you sure you want to sell all positions of this token?')) {
      sellAllMutation.mutate({ tokenAddress, exitPrice: currentPrice });
    }
  };

  // Get current price from WebSocket feed or use entry price as fallback
  const getPositionWithPrice = (position: Position) => ({
    ...position,
    currentPrice: getPrice(position.tokenAddress) || position.entryPrice,
  });

  const calculateCurrentValue = (position: Position, currentPrice: number) => {
    // position.amount is in integer tokens (1B = 1 token), currentPrice is in Lamports per token
    const tokenAmount = position.amount / 1_000_000_000;
    return Math.floor(tokenAmount * currentPrice);
  };

  const calculateProfitLoss = (position: Position, currentPrice: number) => {
    const currentValue = calculateCurrentValue(position, currentPrice);
    return currentValue - position.solSpent;
  };

  const calculateProfitLossPercent = (position: Position, currentPrice: number) => {
    const pl = calculateProfitLoss(position, currentPrice);
    return (pl / position.solSpent) * 100;
  };

  const totalInvested = positions.reduce((sum: number, p: Position) => sum + p.solSpent, 0);
  const totalCurrentValue = positions.reduce((sum: number, p: Position) => {
    const withPrice = getPositionWithPrice(p);
    return sum + calculateCurrentValue(p, withPrice.currentPrice);
  }, 0);
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
              <p className="text-2xl font-bold font-mono text-foreground" data-testid="text-invested">
                {formatSol(totalInvested)} SOL
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-chart-2/10 p-3">
              <TrendingUp className="h-6 w-6 text-chart-2" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Value</p>
              <p className="text-2xl font-bold font-mono text-foreground" data-testid="text-current-value">
                {formatSol(totalCurrentValue)} SOL
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className={`rounded-full ${totalPL >= 0 ? 'bg-success/10' : 'bg-destructive/10'} p-3`}>
              {totalPL >= 0 ? (
                <TrendingUp className="h-6 w-6 text-success" />
              ) : (
                <TrendingDown className="h-6 w-6 text-destructive" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unrealized P/L</p>
              <p 
                className={`text-2xl font-bold font-mono ${totalPL >= 0 ? 'text-success' : 'text-destructive'}`}
                data-testid="text-unrealized-pl"
              >
                {totalPL >= 0 ? '+' : ''}{formatSol(totalPL)} SOL
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-6">
          <h2 className="text-2xl font-bold text-foreground mb-6">Open Positions</h2>
          
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading positions...</p>
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-xl text-muted-foreground mb-2">No open positions</p>
              <p className="text-sm text-muted-foreground">Start trading to see your positions here</p>
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
                    const currentValue = calculateCurrentValue(position, positionWithPrice.currentPrice);
                    const pl = calculateProfitLoss(position, positionWithPrice.currentPrice);
                    const plPercent = calculateProfitLossPercent(position, positionWithPrice.currentPrice);

                    // Check if this is the first position of a token with multiple positions
                    const tokenPositions = groupedPositions.get(position.tokenAddress) || [];
                    const isFirstOfMultiple = tokenPositions.length > 1 && tokenPositions[0].id === position.id;

                    return (
                      <TableRow key={position.id} data-testid={`row-position-${position.id}`}>
                        <TableCell>
                          <button
                            onClick={() => setLocation(`/token/${position.tokenAddress}`)}
                            className="text-left hover-elevate rounded-md p-2 -ml-2 active-elevate-2"
                            data-testid={`button-view-token-${position.id}`}
                          >
                            <p className="font-semibold text-foreground">{position.tokenSymbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {position.tokenName}
                            </p>
                            {isFirstOfMultiple && (
                              <Badge variant="secondary" className="mt-1 text-xs">
                                {tokenPositions.length} positions
                              </Badge>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(position.amount / 1_000_000_000).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatSol(position.entryPrice, 8)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatSol(positionWithPrice.currentPrice, 8)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatSol(position.solSpent)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatSol(currentValue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span className={`font-mono font-semibold ${pl >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {pl >= 0 ? '+' : ''}{formatSol(pl)}
                            </span>
                            <Badge 
                              variant={pl >= 0 ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {pl >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col gap-2">
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
                                onClick={() => handleSellAll(position.tokenAddress, positionWithPrice.currentPrice)}
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
