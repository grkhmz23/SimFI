import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TradeModal } from '@/components/TradeModal';
import { useAuth } from '@/lib/auth-context';
import { formatSol, formatTokenAmount, lamportsToTokens } from '@/lib/lamports';
import { TrendingUp, TrendingDown, Wallet, ShoppingCart, DollarSign, ExternalLink, BarChart3 } from 'lucide-react';
import type { Position } from '@shared/schema';

interface EnrichedPosition extends Position {
  currentPrice: number;
  currentValue: bigint;
  profitLoss: bigint;
  profitLossPercent: number;
}

export default function Positions() {
  const { isAuthenticated } = useAuth();
  const [selectedPosition, setSelectedPosition] = useState<EnrichedPosition | null>(null);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [showTradeModal, setShowTradeModal] = useState(false);

  const { data: positionsData, isLoading } = useQuery<{ positions: EnrichedPosition[] }>({
    queryKey: ['/api/trades/positions'],
    enabled: isAuthenticated,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const positions = positionsData?.positions || [];

  const openTradeModal = (position: EnrichedPosition, mode: 'buy' | 'sell') => {
    setSelectedPosition(position);
    setTradeMode(mode);
    setShowTradeModal(true);
  };

  const closeTradeModal = () => {
    setShowTradeModal(false);
    setSelectedPosition(null);
  };

  // Calculate total portfolio value and P&L (keep all math in BigInt)
  const totalValueLamports = positions.reduce((sum, p) => sum + p.currentValue, 0n);
  const totalInvestedLamports = positions.reduce((sum, p) => sum + p.solSpent, 0n);
  const totalPnLLamports = totalValueLamports - totalInvestedLamports;
  const totalPnLPercent = totalInvestedLamports > 0n 
    ? (Number(totalPnLLamports) / Number(totalInvestedLamports)) * 100 
    : 0;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h1 className="text-2xl font-bold mb-2">Login Required</h1>
            <p className="text-muted-foreground mb-6">
              You need to be logged in to view your positions
            </p>
            <Link href="/login">
              <Button data-testid="button-login">Login</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header with Portfolio Summary */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent" data-testid="text-page-title">
            Your Positions
          </h1>

          {positions.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-5 w-5" />
                  <span className="font-semibold">Portfolio Summary</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Positions</p>
                    <p className="text-2xl font-bold font-mono" data-testid="text-total-positions">
                      {positions.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Invested</p>
                    <p className="text-2xl font-bold font-mono" data-testid="text-total-invested">
                      {formatSol(totalInvestedLamports)} SOL
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Current Value</p>
                    <p className="text-2xl font-bold font-mono" data-testid="text-total-value">
                      {formatSol(totalValueLamports)} SOL
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total P/L</p>
                    <div className="flex items-baseline gap-2">
                      <p 
                        className={`text-2xl font-bold font-mono ${totalPnLLamports >= 0n ? 'text-success' : 'text-destructive'}`}
                        data-testid="text-total-pnl"
                      >
                        {totalPnLLamports >= 0n ? '+' : ''}{formatSol(totalPnLLamports)}
                      </p>
                      <Badge variant={totalPnLLamports >= 0n ? 'default' : 'destructive'}>
                        {totalPnLLamports >= 0n ? '+' : ''}{totalPnLPercent.toFixed(2)}%
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Positions Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-6 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-8 bg-muted rounded" />
                  <div className="h-8 bg-muted rounded" />
                  <div className="flex gap-2">
                    <div className="h-9 bg-muted rounded flex-1" />
                    <div className="h-9 bg-muted rounded flex-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : positions.length === 0 ? (
          <Card className="p-12 text-center">
            <Wallet className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-2xl font-bold mb-2" data-testid="text-no-positions">No Open Positions</h2>
            <p className="text-muted-foreground mb-6">
              You don't have any open positions yet. Start trading to build your portfolio!
            </p>
            <Link href="/">
              <Button data-testid="button-start-trading">
                <TrendingUp className="h-4 w-4 mr-2" />
                Start Trading
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {positions.map((position) => {
              const pnl = Number(position.profitLoss);
              const pnlPercent = position.profitLossPercent;
              const isProfitable = pnl >= 0;
              const tokenAmount = lamportsToTokens(position.amount, position.decimals);

              return (
                <Card key={position.id} className="hover-elevate" data-testid={`card-position-${position.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold truncate" data-testid={`text-token-symbol-${position.id}`}>
                          {position.tokenSymbol}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate" data-testid={`text-token-name-${position.id}`}>
                          {position.tokenName}
                        </p>
                      </div>
                      <Link href={`/token/${position.tokenAddress}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-token-${position.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Holdings */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Holdings</span>
                        <span className="font-mono font-semibold" data-testid={`text-holdings-${position.id}`}>
                          {formatTokenAmount(tokenAmount, 2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Entry Price</span>
                        <span className="font-mono" data-testid={`text-entry-price-${position.id}`}>
                          {formatSol(position.entryPrice, 8)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current Price</span>
                        <span className="font-mono" data-testid={`text-current-price-${position.id}`}>
                          {formatSol(BigInt(Math.floor(position.currentPrice)), 8)}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-border pt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Invested</span>
                        <span className="font-mono" data-testid={`text-invested-${position.id}`}>
                          {formatSol(position.solSpent)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current Value</span>
                        <span className="font-mono font-semibold" data-testid={`text-value-${position.id}`}>
                          {formatSol(position.currentValue)}
                        </span>
                      </div>
                    </div>

                    {/* P/L Display */}
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Profit / Loss</span>
                        <div className="flex items-center gap-2">
                          {isProfitable ? (
                            <TrendingUp className="h-4 w-4 text-success" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span 
                          className={`text-xl font-bold font-mono ${isProfitable ? 'text-success' : 'text-destructive'}`}
                          data-testid={`text-pnl-${position.id}`}
                        >
                          {isProfitable ? '+' : ''}{formatSol(position.profitLoss)}
                        </span>
                        <Badge variant={isProfitable ? 'default' : 'destructive'} data-testid={`badge-pnl-percent-${position.id}`}>
                          {isProfitable ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </Badge>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() => openTradeModal(position, 'buy')}
                        data-testid={`button-buy-more-${position.id}`}
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Buy More
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() => openTradeModal(position, 'sell')}
                        data-testid={`button-sell-${position.id}`}
                      >
                        <DollarSign className="h-4 w-4" />
                        Sell
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Trade Modal */}
        {showTradeModal && selectedPosition && (
          <TradeModal
            position={selectedPosition}
            onClose={closeTradeModal}
          />
        )}
      </div>
    </div>
  );
}
