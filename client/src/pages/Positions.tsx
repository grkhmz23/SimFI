import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TradeModal } from '@/components/TradeModal';
import { useAuth } from '@/lib/auth-context';
import { useSolPrice } from '@/lib/price-context';
import { formatNative, formatTokenAmount, formatPricePerToken, formatPricePerTokenUSD, nativeToTokens, toBigInt, formatUSD } from '@/lib/token-format';
import { useChain } from '@/lib/chain-context';
import { TrendingUp, TrendingDown, Wallet, ShoppingCart, DollarSign, ExternalLink, BarChart3 } from 'lucide-react';
import type { Position } from '@shared/schema';

interface EnrichedPosition extends Position {
  currentPrice: number | string | bigint;
  currentValue: bigint;
  profitLoss: bigint;
  profitLossPercent: number;
}

export default function Positions() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const solPrice = useSolPrice(); // Get current SOL price from context
  const { activeChain, nativeSymbol } = useChain();
  const [selectedPosition, setSelectedPosition] = useState<EnrichedPosition | null>(null);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [showTradeModal, setShowTradeModal] = useState(false);

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

  // Enrich positions with calculated P/L values
  const positions: EnrichedPosition[] = (positionsData?.positions || []).map(p => {
    const amountBigInt = toBigInt(p.amount);
    const currentPriceBigInt = toBigInt(p.currentPrice);
    const solSpentBigInt = toBigInt(p.solSpent);
    const decimals = p.decimals || 6;
    const divisor = BigInt(10 ** decimals);
    
    // Calculate current value: (amount * currentPrice) / 10^decimals
    const currentValue = (amountBigInt * currentPriceBigInt) / divisor;
    
    // Calculate profit/loss
    const profitLoss = currentValue - solSpentBigInt;
    
    // Calculate profit/loss percentage
    const profitLossPercent = solSpentBigInt > BigInt(0) 
      ? (Number(profitLoss) / Number(solSpentBigInt)) * 100 
      : 0;
    
    return {
      ...p,
      currentValue,
      profitLoss,
      profitLossPercent,
    };
  });

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
  // Note: Values come from JSON so we need to convert them to BigInt
  const totalValueLamports = positions.reduce((sum, p) => sum + toBigInt(p.currentValue), BigInt(0));
  const totalInvestedLamports = positions.reduce((sum, p) => sum + toBigInt(p.solSpent), BigInt(0));
  const totalPnLLamports = totalValueLamports - totalInvestedLamports;
  const totalPnLPercent = totalInvestedLamports > BigInt(0)
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
                      {formatNative(totalInvestedLamports, activeChain, 2)} {nativeSymbol}
                    </p>
                    <p className="text-sm text-muted-foreground font-mono">≈ {formatUSD(totalInvestedLamports, 2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Current Value</p>
                    <p className="text-2xl font-bold font-mono" data-testid="text-total-value">
                      {formatNative(totalValueLamports, activeChain, 2)} {nativeSymbol}
                    </p>
                    <p className="text-sm text-muted-foreground font-mono">≈ {formatUSD(totalValueLamports, 2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total P/L</p>
                    <div className="flex items-baseline gap-2">
                      <p 
                        className={`text-2xl font-bold font-mono ${totalPnLLamports >= BigInt(0) ? 'text-success' : 'text-destructive'}`}
                        data-testid="text-total-pnl"
                      >
                        {totalPnLLamports >= BigInt(0) ? '+' : ''}{formatNative(totalPnLLamports, activeChain, 2)} {nativeSymbol}
                      </p>
                      <Badge variant={totalPnLLamports >= BigInt(0) ? 'default' : 'destructive'}>
                        {totalPnLLamports >= BigInt(0) ? '+' : ''}{totalPnLPercent.toFixed(2)}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">
                      ≈ {totalPnLLamports >= BigInt(0) ? '+' : ''}{formatUSD(totalPnLLamports, 2)}
                    </p>
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
              const pnlBigInt = toBigInt(position.profitLoss);
              const pnl = Number(pnlBigInt);
              const pnlPercent = position.profitLossPercent;
              const isProfitable = pnl >= 0;

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
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setLocation(`/token/${position.tokenAddress}`)}
                        data-testid={`button-view-token-${position.id}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Holdings */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Holdings</span>
                        <span className="font-mono font-semibold" data-testid={`text-holdings-${position.id}`}>
                          {formatTokenAmount(position.amount, 6, position.decimals || 6)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Entry Price (Jupiter Swap)</span>
                        <span className="font-mono" data-testid={`text-entry-price-${position.id}`}>
                          {formatPricePerTokenUSD(position.entryPrice, 6, solPrice)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current Price</span>
                        <span className="font-mono" data-testid={`text-current-price-${position.id}`}>
                          {formatPricePerTokenUSD(position.currentPrice, 6, solPrice)}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-border pt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Invested</span>
                        <span className="font-mono" data-testid={`text-invested-${position.id}`}>
                          {formatUSD(toBigInt(position.solSpent), 2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current Value</span>
                        <span className="font-mono font-semibold" data-testid={`text-value-${position.id}`}>
                          {formatUSD(toBigInt(position.currentValue), 2)}
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
                          {isProfitable ? '+' : ''}{formatUSD(pnlBigInt, 2)}
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
            mode={tradeMode}
            onClose={closeTradeModal}
          />
        )}
      </div>
    </div>
  );
}
