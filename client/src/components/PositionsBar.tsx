import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Wallet, ChevronRight } from 'lucide-react';
import { formatSol, formatTokenAmount, toBigInt } from '@/lib/lamports';
import type { Position } from '@shared/schema';

export function PositionsBar() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: positionsData, isLoading } = useQuery<{ positions: Position[] }>({
    queryKey: ['/api/trades/positions'],
    enabled: isAuthenticated,
    staleTime: 5000,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const positions = positionsData?.positions || [];

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Your Positions</h2>
        </div>
        <p className="text-sm text-muted-foreground">Loading positions...</p>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Your Positions</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          No open positions. Start trading to see your holdings here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">Your Positions</h2>
        <Badge variant="outline" className="ml-auto">
          {positions.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {positions.map((position) => {
          const amountDisplay = formatTokenAmount(position.amount, position.decimals || 6);

          return (
            <div
              key={position.id}
              onClick={() => setLocation(`/token/${position.tokenAddress}`)}
              className="p-3 rounded-md hover-elevate active-elevate-2 cursor-pointer border"
              data-testid={`position-${position.tokenAddress}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-sm truncate" data-testid={`text-position-name-${position.tokenAddress}`}>
                      {position.tokenName}
                    </h3>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {position.tokenSymbol}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="ml-1 font-mono font-semibold">{amountDisplay}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Entry:</span>
                      <span className="ml-1 font-mono font-semibold">
                        {formatSol(toBigInt(position.entryPrice))} SOL
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Total Spent:</span>
                      <span className="ml-1 font-mono font-semibold text-foreground">
                        {formatSol(toBigInt(position.solSpent))} SOL
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
