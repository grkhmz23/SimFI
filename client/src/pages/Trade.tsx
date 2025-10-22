import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ArrowRight, TrendingUp, Zap, Shield, BarChart3, Users, Rocket, Star, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { PositionsBar } from '@/components/PositionsBar';
import logoUrl from '@assets/Gemini_Generated_Image_b4urolb4urolb4ur_1761160658932.png';

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
  const [contractAddress, setContractAddress] = useState('');
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

  const handleGoToToken = () => {
    const trimmedAddress = contractAddress.trim();
    if (!trimmedAddress) {
      toast({
        title: 'Invalid Input',
        description: 'Please enter a valid contract address',
        variant: 'destructive',
      });
      return;
    }

    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(trimmedAddress)) {
      toast({
        title: 'Invalid Address',
        description: 'Contract address must be 32-44 characters of valid Base58',
        variant: 'destructive',
      });
      return;
    }

    setLocation(`/token/${trimmedAddress}`);
  };

  const handleTokenClick = (address: string) => {
    setLocation(`/token/${address}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGoToToken();
    }
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
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-2 mb-6">
                <img src={logoUrl} alt="SimFi" className="h-16 w-auto" />
              </div>
              <h1 className="text-4xl md:text-6xl font-bold mb-4">
                <span className="gradient-simfi-text">Your Gateway to</span>
                <br />
                <span className="text-foreground">Risk-Free DeFi Trading</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                Practice trading Solana memecoins with virtual SOL. Master your strategy without financial risk.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                {!isAuthenticated ? (
                  <>
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
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 text-lg">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className="font-mono font-bold text-primary text-2xl">
                        {(Number(user?.balance || 0) / 1_000_000_000).toFixed(0)} SOL
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                <Card className="p-4 text-center bg-card/50 backdrop-blur">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-2xl font-bold gradient-simfi-text">Instant</div>
                  <div className="text-sm text-muted-foreground">Execution</div>
                </Card>
                <Card className="p-4 text-center bg-card/50 backdrop-blur">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-2xl font-bold gradient-simfi-text">100%</div>
                  <div className="text-sm text-muted-foreground">Risk-Free</div>
                </Card>
                <Card className="p-4 text-center bg-card/50 backdrop-blur">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-2xl font-bold gradient-simfi-text">Real</div>
                  <div className="text-sm text-muted-foreground">Market Data</div>
                </Card>
                <Card className="p-4 text-center bg-card/50 backdrop-blur">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-2xl font-bold gradient-simfi-text">Live</div>
                  <div className="text-sm text-muted-foreground">Leaderboard</div>
                </Card>
              </div>
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

      {/* Main Search Section */}
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Start Trading</h2>
            <p className="text-muted-foreground">Enter a contract address or search to begin</p>
          </div>

          <Card className="p-6 md:p-8">
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3 text-foreground">
                Contract Address
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="text"
                  placeholder="Enter Solana token contract address..."
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1 font-mono"
                  data-testid="input-contract-address"
                />
                <Button
                  onClick={handleGoToToken}
                  className="gap-2 whitespace-nowrap"
                  data-testid="button-go-to-token"
                >
                  Go to Token
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Example: 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr
              </p>
            </div>

            <div className="relative pt-6 border-t">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3">
                <span className="text-sm text-muted-foreground font-semibold">OR</span>
              </div>
              <label className="block text-sm font-semibold mb-3 text-foreground">
                Search Tokens
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by name, symbol, or address..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Search Results */}
        {showSearchResults && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              Search Results
              {hasSearchResults && (
                <Badge variant="secondary" className="ml-2">
                  {searchResults.results.length}
                </Badge>
              )}
            </h2>

            {isSearching ? (
              <Card className="p-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
                <p className="text-muted-foreground">Searching tokens...</p>
              </Card>
            ) : hasSearchResults ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.results.map((result) => (
                  <Card
                    key={result.tokenAddress}
                    className="p-4 hover-elevate active-elevate-2 cursor-pointer transition-all"
                    onClick={() => handleTokenClick(result.tokenAddress)}
                    data-testid={`search-result-${result.tokenAddress}`}
                  >
                    <div className="flex items-start gap-3">
                      {result.icon && (
                        <img
                          src={result.icon}
                          alt={result.name}
                          className="w-12 h-12 rounded-full shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-lg truncate" data-testid={`text-name-${result.tokenAddress}`}>
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
                          <div className="flex items-center gap-2 mt-2">
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
                      <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No tokens found for "{debouncedQuery}"
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Try searching by token name, symbol, or contract address
                </p>
              </Card>
            )}
          </div>
        )}

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
