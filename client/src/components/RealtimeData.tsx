// client/src/components/RealtimeData.tsx
// Real-time Data Component - Live token prices and stats

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  RefreshCw,
  Clock
} from 'lucide-react';

export default function RealtimeData() {
  const [searchQuery, setSearchQuery] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>([
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'So11111111111111111111111111111111111111112', // SOL
  ]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Query for watchlist tokens
  const { data: tokensData, isLoading, refetch } = useQuery({
    queryKey: ['realtime-tokens', watchlist],
    queryFn: async () => {
      if (watchlist.length === 0) return [];
      
      const res = await fetch('/api/study/tokens/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintAddresses: watchlist }),
      });
      
      if (!res.ok) throw new Error('Failed to fetch token data');
      return res.json();
    },
    enabled: watchlist.length > 0,
    refetchInterval: autoRefresh ? 30000 : false, // Refresh every 30 seconds
  });

  // Update last refresh time
  useEffect(() => {
    if (tokensData) {
      setLastUpdate(Date.now());
    }
  }, [tokensData]);

  const addToWatchlist = (address: string) => {
    if (!watchlist.includes(address) && watchlist.length < 20) {
      setWatchlist([...watchlist, address]);
      setSearchQuery('');
    }
  };

  const removeFromWatchlist = (address: string) => {
    setWatchlist(watchlist.filter(a => a !== address));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(searchQuery.trim())) {
      addToWatchlist(searchQuery.trim());
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const getTimeSinceUpdate = () => {
    const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <Input
            placeholder="Add token to watchlist (paste mint address)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <Button type="submit">
            <Search className="w-4 h-4 mr-2" />
            Add
          </Button>
        </form>

        {/* Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className="w-4 h-4 mr-2" />
            Auto
          </Button>
        </div>
      </div>

      {/* Last Update Time */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>Last updated: {getTimeSinceUpdate()}</span>
        </div>
        <div>
          {watchlist.length}/20 tokens in watchlist
        </div>
      </div>

      {/* Info Alert */}
      <Alert>
        <Activity className="w-4 h-4" />
        <AlertDescription>
          Real-time price data integration coming soon. Currently showing token metadata.
          {autoRefresh && ' Auto-refresh is enabled (30s interval).'}
        </AlertDescription>
      </Alert>

      {/* Loading State */}
      {isLoading && watchlist.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(watchlist.length)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      )}

      {/* Watchlist */}
      {!isLoading && tokensData && tokensData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tokensData.map((token: any, idx: number) => {
            // Mock price data (will be replaced with real API integration)
            const mockPrice = Math.random() * 100;
            const mockChange = (Math.random() - 0.5) * 20;
            const isPositive = mockChange > 0;

            return (
              <Card key={idx} className="relative overflow-hidden hover:border-primary/50 transition-colors">
                {/* Remove Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => removeFromWatchlist(token.account || watchlist[idx])}
                >
                  ×
                </Button>

                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    {token.metadata?.legacyMetadata?.logoURI && (
                      <img
                        src={token.metadata.legacyMetadata.logoURI}
                        alt={token.metadata.legacyMetadata.name || token.metadata.onChainMetadata?.metadata?.data?.name}
                        className="w-12 h-12 rounded-full"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">
                        {token.metadata?.legacyMetadata?.name || token.metadata?.onChainMetadata?.metadata?.data?.name || 'Unknown Token'}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        {(token.metadata?.legacyMetadata?.symbol || token.metadata?.onChainMetadata?.metadata?.data?.symbol) && (
                          <Badge variant="secondary" className="text-xs">
                            {token.metadata?.legacyMetadata?.symbol || token.metadata?.onChainMetadata?.metadata?.data?.symbol}
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Price Section - Placeholder */}
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Price (Demo)</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">
                        ${mockPrice.toFixed(4)}
                      </span>
                      <span className={`flex items-center gap-1 text-sm ${
                        isPositive ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {isPositive ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        {Math.abs(mockChange).toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs mb-1">24h Volume</div>
                      <div className="font-mono text-muted-foreground">Coming Soon</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs mb-1">Market Cap</div>
                      <div className="font-mono text-muted-foreground">Coming Soon</div>
                    </div>
                  </div>

                  {/* Mint Address */}
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Mint Address</div>
                    <div className="font-mono bg-muted/50 p-2 rounded truncate">
                      {token.account || watchlist[idx]}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : !isLoading && watchlist.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Tokens in Watchlist</h3>
            <p className="text-muted-foreground mb-4">
              Add token mint addresses to start monitoring real-time data
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addToWatchlist('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')}
              >
                Add USDC
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addToWatchlist('So11111111111111111111111111111111111111112')}
              >
                Add SOL
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Future Integration Notice */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">🚀 Coming Soon: Real-time Price Integration</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>Live price data from DexScreener, Birdeye, and Jupiter APIs</li>
            <li>Real-time price charts and candlestick data</li>
            <li>Volume, liquidity, and market cap tracking</li>
            <li>Price alerts and notifications</li>
            <li>Historical price data and analytics</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
