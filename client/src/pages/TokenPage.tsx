import { useState, useEffect } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TradeModal } from '@/components/TradeModal';
import TokenChart from '@/components/TokenChart';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, TrendingUp, ExternalLink, Copy } from 'lucide-react';
import { formatSol, formatTokenAmount, toBigInt, formatUSD } from '@/lib/lamports';
import type { Token, Position } from '@shared/schema';

export default function TokenPage() {
  const params = useParams();
  const tokenAddress = params.address;
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  // Get token from location state (passed from navigation)
  const locationState = (typeof window !== 'undefined' && (window.history.state as any)?.state) || {};
  const [token, setToken] = useState<Token | null>(locationState.token || null);
  const [showModal, setShowModal] = useState(false);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [priceChange, setPriceChange] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | null>(null);

  // Fetch token from API with auto-refresh every 5 seconds (real-time updates)
  const { data: tokenData, isLoading: tokenLoading, error: tokenError, dataUpdatedAt } = useQuery<{ token: Token }>({
    queryKey: [`/api/tokens/${tokenAddress}`],
    enabled: !!tokenAddress,
    refetchInterval: 5000, // Real-time: Refresh every 5 seconds
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not focused
    retry: 3, // Retry failed requests
    retryDelay: 1000, // Wait 1 second between retries
  });

  // Reset price tracking state when navigating to a different token
  useEffect(() => {
    setPriceChange(0);
    setPreviousPrice(null);
    setLastUpdate(null);
  }, [tokenAddress]);

  // Update token state and calculate price change when API data is available
  useEffect(() => {
    if (tokenData?.token) {
      // Validate token data before setting state
      const newToken = tokenData.token;
      if (newToken.tokenAddress && newToken.name && newToken.symbol) {
        // Calculate price change if we have a previous price
        if (previousPrice !== null && newToken.price && previousPrice !== newToken.price && previousPrice > 0) {
          const change = ((newToken.price - previousPrice) / previousPrice) * 100;
          setPriceChange(change);
        }
        
        // Update previous price for next comparison
        if (newToken.price) {
          setPreviousPrice(newToken.price);
        }
        
        setToken(newToken);
        setLastUpdate(new Date(dataUpdatedAt));
      } else {
        console.error('Invalid token data received:', newToken);
      }
    }
  }, [tokenData, dataUpdatedAt]);

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

  // Show error if query failed
  if (tokenError && !token) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Trade
            </Button>
          </Link>
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-4 text-destructive">Error Loading Token</h1>
            <p className="text-muted-foreground mb-6">
              Could not fetch token data. Please check your connection and try again.
            </p>
            <p className="text-sm text-muted-foreground mb-4 font-mono">
              {tokenAddress}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => window.location.reload()} variant="default" data-testid="button-retry">
                Retry
              </Button>
              <Link href="/">
                <Button variant="outline" data-testid="button-back-home">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go back to Trade page
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

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

  // Validate token price - prevent crashes from invalid/missing price data  
  const hasValidPrice = token?.price && !isNaN(token.price) && isFinite(token.price) && token.price > 0;
  
  if (!hasValidPrice) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Tokens
            </Button>
          </Link>
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-4">{token.name}</h1>
            <Badge variant="outline" className="mb-4">
              {token.symbol}
            </Badge>
            <p className="text-muted-foreground mb-6">
              Price data is currently unavailable for this token. It may be too new or not yet indexed.
            </p>
            <p className="text-sm text-muted-foreground mb-4 font-mono">
              {tokenAddress}
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

  const formatMarketCap = (mc: number | undefined) => {
    if (!mc || isNaN(mc) || !isFinite(mc)) return '$0';
    if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(2)}B`;
    if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`;
    if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
    return `$${mc.toFixed(0)}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress!);
      toast({
        title: 'Copied!',
        description: 'Token address copied to clipboard',
      });
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Please copy manually',
        variant: 'destructive',
      });
    }
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

          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                {token.icon && (
                  <img 
                    src={token.icon} 
                    alt={token.symbol}
                    className="w-12 h-12 rounded-full shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="flex flex-col gap-1">
                  <h1 className="text-2xl font-bold text-foreground" data-testid="text-token-name">
                    {token.name}
                  </h1>
                  <Badge variant="outline" className="shrink-0 w-fit">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {token.symbol}
                  </Badge>
                </div>
                {/* Live Indicator */}
                <Badge 
                  variant="outline" 
                  className="shrink-0 border-destructive/50 bg-destructive/10 text-destructive animate-pulse"
                  data-testid="badge-live"
                >
                  🔴 LIVE
                </Badge>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={copyToClipboard}
                  className="text-sm font-mono text-muted-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-2 group"
                  data-testid="button-copy-address"
                >
                  {tokenAddress}
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
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
          </div>
        </div>

        {/* Main Content: Chart on Left, Trading Panel on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart Section - Takes 2/3 width on large screens */}
          <div className="lg:col-span-2 space-y-4">
            <TokenChart
              tokenAddress={tokenAddress!}
              tokenSymbol={token.symbol}
              tokenName={token.name}
              currentPrice={token.priceUsd !== undefined ? token.priceUsd : (token.price ? token.price / 1_000_000_000 : 0)}
              priceChange24h={token.priceChange24h || 0}
              volume24h={token.volume24h || 0}
              liquidity={0}
              height="500px"
            />
          </div>

          {/* Trading Panel - Takes 1/3 width on large screens */}
          <div className="space-y-4">
            {/* Price Card */}
            <Card className="p-6">
              <div className="mb-4">
                <p className="text-xs text-muted-foreground uppercase mb-1">Current Price</p>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-3xl font-bold font-mono" data-testid="text-current-price">
                    {token.priceUsd !== undefined ? `$${token.priceUsd < 0.01 ? token.priceUsd.toFixed(6) : token.priceUsd.toFixed(4)}` : formatUSD(token.price)}
                  </span>
                  {(token.priceChange24h !== undefined && token.priceChange24h !== 0) ? (
                    <span 
                      className={`text-sm font-semibold ${token.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'}`}
                      data-testid="text-price-change"
                    >
                      {token.priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(token.priceChange24h).toFixed(2)}%
                    </span>
                  ) : priceChange !== 0 && (
                    <span 
                      className={`text-sm font-semibold ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}
                      data-testid="text-price-change"
                    >
                      {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                    </span>
                  )}
                </div>
                {lastUpdate && (
                  <div className="text-xs text-muted-foreground mt-1" data-testid="text-last-update">
                    Updated: {lastUpdate.toLocaleTimeString()}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <p className="text-xs text-muted-foreground uppercase mb-1">Market Cap</p>
                <p className="text-xl font-bold text-foreground" data-testid="text-marketcap">
                  {formatMarketCap(token.marketCap)}
                </p>
              </div>

              {/* Trade Buttons */}
              <div className="flex flex-col gap-3">
                <Button
                  size="lg"
                  onClick={() => openTradeModal('buy')}
                  data-testid="button-buy"
                  className="w-full"
                >
                  Buy {token.symbol}
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={() => openTradeModal('sell')}
                  disabled={!userPosition}
                  data-testid="button-sell"
                  className="w-full"
                >
                  Sell {token.symbol}
                </Button>
              </div>
            </Card>

            {/* Position Info (if user owns this token) */}
            {userPosition && (
              <Card className="p-6">
                <h2 className="text-lg font-bold mb-4">Your Position</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Amount Held</p>
                    <p className="text-xl font-bold font-mono">
                      {Number(formatTokenAmount(userPosition.amount, 2, userPosition.decimals || token.decimals || 6)).toLocaleString()} {token.symbol}
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
                        try {
                          const amount = toBigInt(userPosition.amount);
                          const price = Number(token.price);
                          if (!isFinite(price) || price <= 0) {
                            return '0.00 SOL';
                          }
                          const priceLamports = BigInt(Math.floor(price));
                          const decimals = userPosition.decimals || 6;
                          const decimalDivisor = BigInt(10 ** decimals);
                          const valueLamports = (amount * priceLamports) / decimalDivisor;
                          return formatSol(valueLamports) + ' SOL';
                        } catch (error) {
                          console.error('Error calculating position value:', error);
                          return '0.00 SOL';
                        }
                      })()}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Trade Modal */}
      {showModal && (
        <TradeModal
          token={tradeMode === 'buy' ? token : undefined}
          position={tradeMode === 'sell' && userPosition ? userPosition : undefined}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
