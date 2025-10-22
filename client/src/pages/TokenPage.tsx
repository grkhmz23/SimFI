import { useState, useEffect } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TradeModal } from '@/components/TradeModal';
import TokenChart from '@/components/TokenChart';
import { useAuth } from '@/lib/auth-context';
import { ArrowLeft, TrendingUp, ExternalLink } from 'lucide-react';
import { formatSol, formatTokenAmount, toBigInt, formatUSD } from '@/lib/lamports';
import type { Token, Position } from '@shared/schema';

export default function TokenPage() {
  const params = useParams();
  const tokenAddress = params.address;
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  
  // Get token from location state (passed from navigation)
  const locationState = (typeof window !== 'undefined' && (window.history.state as any)?.state) || {};
  const [token, setToken] = useState<Token | null>(locationState.token || null);
  const [showModal, setShowModal] = useState(false);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');

  // Fetch token from API with auto-refresh every 10 seconds
  const { data: tokenData, isLoading: tokenLoading } = useQuery<{ token: Token }>({
    queryKey: ['/api/tokens', tokenAddress],
    enabled: !!tokenAddress,
    refetchInterval: 10000, // Refresh every 10 seconds to keep price and market cap up to date
  });

  // Update token state when API data is available or on refresh
  useEffect(() => {
    if (tokenData?.token) {
      setToken(tokenData.token);
    }
  }, [tokenData]);

  // Fetch user's positions to check if they own this token
  const { data: positionsData } = useQuery<{ positions: Position[] }>({
    queryKey: ['/api/trades/positions'],
    enabled: isAuthenticated,
  });

  const userPosition = positionsData?.positions?.find(
    p => p.tokenAddress === tokenAddress
  );

  const openTradeModal = (mode: 'buy' | 'sell') => {
    setTradeMode(mode);
    setShowModal(true);
  };

  if (!token && tokenLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-4">Loading Token...</h1>
            <p className="text-muted-foreground">
              Fetching token data...
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-4">Token Not Found</h1>
            <p className="text-muted-foreground mb-6">
              This token is not available in our current feed.
            </p>
            <Link href="/">
              <Button variant="outline" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go back to Trade page
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  const formatMarketCap = (mc: number) => {
    if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`;
    if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
    return `$${mc.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Tokens
            </Button>
          </Link>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-foreground" data-testid="text-token-name">
                  {token.name}
                </h1>
                <Badge variant="outline" className="shrink-0">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {token.symbol}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono text-muted-foreground" data-testid="text-token-address">
                  {tokenAddress}
                </p>
                <a
                  href={`https://solscan.io/token/${tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                size="lg"
                onClick={() => openTradeModal('buy')}
                data-testid="button-buy"
                className="min-w-[120px]"
              >
                Buy
              </Button>
              <Button
                size="lg"
                variant="destructive"
                onClick={() => openTradeModal('sell')}
                disabled={!userPosition}
                data-testid="button-sell"
                className="min-w-[120px]"
              >
                Sell
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase mb-1">Current Price</p>
            <p className="text-2xl font-bold font-mono text-primary" data-testid="text-price">
              {formatUSD(token.price, 6)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase mb-1">Market Cap</p>
            <p className="text-2xl font-bold text-foreground" data-testid="text-marketcap">
              {formatMarketCap(token.marketCap)}
            </p>
          </Card>
        </div>

        {/* Chart Container */}
        <TokenChart
          tokenAddress={tokenAddress!}
          tokenSymbol={token.symbol}
          tokenName={token.name}
          currentPrice={token.price}
          priceChange24h={0}
          volume24h={0}
          liquidity={0}
          height="600px"
        />

        {/* Position Info (if user owns this token) */}
        {userPosition && (
          <Card className="p-6 bg-muted/50">
            <h2 className="text-lg font-bold mb-4">Your Position</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase mb-1">Amount Held</p>
                <p className="text-xl font-bold font-mono">
                  {Number(formatTokenAmount(userPosition.amount, 2)).toLocaleString()} {token.symbol}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase mb-1">Entry Price</p>
                <p className="text-xl font-bold font-mono">
                  {formatSol(userPosition.entryPrice, 8)} SOL
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase mb-1">Current Value</p>
                <p className="text-xl font-bold font-mono text-primary">
                  {(() => {
                    const amount = toBigInt(userPosition.amount);
                    const priceLamports = BigInt(Math.floor(token.price));
                    const valueLamports = (amount * priceLamports) / BigInt(1_000_000_000);
                    return formatSol(valueLamports);
                  })()} SOL
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Trade Modal */}
      {showModal && (
        <TradeModal
          token={tradeMode === 'buy' ? token : undefined}
          position={tradeMode === 'sell' && userPosition ? { ...userPosition, currentPrice: token.price } : undefined}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
