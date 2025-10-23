import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ArrowRight, TrendingUp, Zap, Shield, BarChart3, Users, Rocket, Star, Trophy, Send } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { PositionsBar } from '@/components/PositionsBar';

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  icon?: string;
  marketCap?: number;
  price?: number;
}

interface Token {
  tokenAddress: string;
  name: string;
  symbol: string;
  marketCap: number;
  priceChange24h?: number;
}

export default function Trade() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults, isLoading: isSearching } = useQuery<{ results: SearchResult[] }>({
    queryKey: ['/api/tokens/search', debouncedQuery],
    queryFn: async () => {
      const response = await fetch(`/api/tokens/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!response.ok) {
        toast({
          title: 'Search Failed',
          description: 'Could not search tokens. Please try again.',
          variant: 'destructive',
        });
        throw new Error('Search failed');
      }
      return response.json();
    },
    enabled: debouncedQuery.length >= 3,
    staleTime: 30000,
  });

  const { data: trendingTokens } = useQuery<{ tokens: Token[] }>({
    queryKey: ['/api/tokens/trending'],
    staleTime: 60000,
  });

  const handleTokenClick = (address: string) => {
    setLocation(`/token/${address}`);
  };

  const hasSearchResults = searchResults && searchResults.results.length > 0;
  const showSearchResults = debouncedQuery.length >= 3;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with Gradient */}
      <div className="relative overflow-hidden gradient-simfi-radial border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-chart-2/5" />
        <div className="container mx-auto px-4 py-16 md:py-24 relative">
          <div className="max-w-5xl mx-auto">
            {/* Hero Content */}
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold mb-4">
                <span className="gradient-simfi-text">Your Gateway to</span>
                <br />
                <span className="text-foreground">Risk-Free DeFi Trading</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
                Practice trading Solana memecoins with virtual SOL. Master your strategy without financial risk.
              </p>

              {/* Google-style Search Bar */}
              <div className="max-w-2xl mx-auto mb-8">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search tokens by name or address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-14 pl-12 pr-4 text-base rounded-full border-2 border-border focus:border-primary shadow-lg"
                    data-testid="input-search-main"
                  />
                </div>

                {/* Search Results - Shown directly below search bar */}
                {showSearchResults && (
                  <div className="mt-6">
                    {isSearching ? (
                      <Card className="p-8 text-center bg-card/95 backdrop-blur">
                        <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin mb-2" />
                        <p className="text-sm text-muted-foreground">Searching tokens...</p>
                      </Card>
                    ) : hasSearchResults ? (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {searchResults.results.map((result) => (
                          <Card
                            key={result.tokenAddress}
                            className="p-4 hover-elevate active-elevate-2 cursor-pointer transition-all bg-card/95 backdrop-blur"
                            onClick={() => handleTokenClick(result.tokenAddress)}
                            data-testid={`search-result-${result.tokenAddress}`}
                          >
                            <div className="flex items-start gap-3">
                              {result.icon && (
                                <img
                                  src={result.icon}
                                  alt={result.name}
                                  className="w-10 h-10 rounded-full shrink-0"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-bold truncate" data-testid={`text-name-${result.tokenAddress}`}>
                                    {result.name}
                                  </h3>
                                  <Badge variant="outline" className="text-xs">
                                    {result.symbol}
                                  </Badge>
                                </div>
                                <p className="text-xs font-mono text-muted-foreground truncate">
                                  {result.tokenAddress}
                                </p>
                                {result.marketCap !== undefined && result.marketCap > 0 && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-sm font-semibold">
                                      ${result.marketCap >= 1_000_000
                                        ? `${(result.marketCap / 1_000_000).toFixed(2)}M`
                                        : result.marketCap >= 1_000
                                        ? `${(result.marketCap / 1_000).toFixed(1)}K`
                                        : result.marketCap.toFixed(0)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card className="p-8 text-center bg-card/95 backdrop-blur">
                        <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No tokens found for "{debouncedQuery}"
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Try a different search term
                        </p>
                      </Card>
                    )}
                  </div>
                )}
              </div>

              {/* CTAs */}
              {!isAuthenticated && !showSearchResults && (
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                  <Button
                    size="lg"
                    onClick={() => setLocation('/register')}
                    className="gradient-simfi text-white hover:opacity-90 transition-opacity gap-2 min-w-[200px]"
                    data-testid="button-get-started"
                  >
                    <Rocket className="h-5 w-5" />
                    Get Started Free
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => setLocation('/leaderboard')}
                    className="min-w-[200px]"
                    data-testid="button-view-leaderboard"
                  >
                    <Trophy className="h-5 w-5" />
                    View Leaderboard
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Positions Bar (Authenticated Users) */}
      {isAuthenticated && (
        <div className="border-b border-border">
          <div className="container mx-auto px-4 py-4">
            <PositionsBar />
          </div>
        </div>
      )}

      {/* Main Content Section */}
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Telegram Bot Link */}
        <div className="mb-12">
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  Trade on Telegram
                </h3>
                <p className="text-xs text-muted-foreground">Access SimFi directly from Telegram</p>
              </div>
              <Button
                variant="outline"
                className="gap-2 gradient-simfi-border"
                onClick={() => window.open('https://t.me/SimFinance_Bot', '_blank')}
                data-testid="button-telegram-bot"
              >
                <Send className="h-4 w-4" />
                @SimFinance_Bot
              </Button>
            </div>
          </Card>
        </div>


        {/* Trending Tokens Section */}
        {!showSearchResults && trendingTokens && trendingTokens.tokens && trendingTokens.tokens.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Trending Tokens
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trendingTokens.tokens.slice(0, 6).map((token) => (
                <Card
                  key={token.tokenAddress}
                  className="p-4 hover-elevate active-elevate-2 cursor-pointer transition-all"
                  onClick={() => handleTokenClick(token.tokenAddress)}
                  data-testid={`trending-token-${token.tokenAddress}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold truncate">{token.name}</h3>
                    {token.priceChange24h !== undefined && (
                      <Badge variant={token.priceChange24h >= 0 ? "default" : "destructive"} className="ml-2">
                        {token.priceChange24h >= 0 ? '+' : ''}
                        {token.priceChange24h.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{token.symbol}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Market Cap</span>
                    <span className="text-sm font-semibold">
                      ${token.marketCap >= 1_000_000
                        ? `${(token.marketCap / 1_000_000).toFixed(2)}M`
                        : token.marketCap >= 1_000
                        ? `${(token.marketCap / 1_000).toFixed(1)}K`
                        : token.marketCap.toFixed(0)}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* How It Works Section */}
        {!showSearchResults && (
          <div className="section-gradient-bottom rounded-lg p-8 md:p-12">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">How SimFi Works</h2>
              <p className="text-muted-foreground">Start trading in three simple steps</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gradient-simfi text-white text-2xl font-bold mb-4">
                  1
                </div>
                <h3 className="text-xl font-semibold mb-2">Create Account</h3>
                <p className="text-muted-foreground">
                  Sign up and get 10 SOL to start trading
                </p>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gradient-simfi text-white text-2xl font-bold mb-4">
                  2
                </div>
                <h3 className="text-xl font-semibold mb-2">Find Tokens</h3>
                <p className="text-muted-foreground">
                  Search or browse trending Solana memecoins with real-time data
                </p>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gradient-simfi text-white text-2xl font-bold mb-4">
                  3
                </div>
                <h3 className="text-xl font-semibold mb-2">Practice Trading</h3>
                <p className="text-muted-foreground">
                  Buy and sell without risk. Track your performance on the leaderboard
                </p>
              </div>
            </div>
            {!isAuthenticated && (
              <div className="text-center mt-8">
                <Button
                  size="lg"
                  onClick={() => setLocation('/register')}
                  className="gradient-simfi text-white hover:opacity-90 transition-opacity gap-2"
                  data-testid="button-get-started-bottom"
                >
                  <Star className="h-5 w-5" />
                  Start Trading Now
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
