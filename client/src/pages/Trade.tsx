import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Search, Loader2, ArrowRight, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  icon?: string;
  marketCap?: number;
  price?: number;
}

export default function Trade() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
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
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    enabled: debouncedQuery.length >= 3,
    staleTime: 30000,
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

    if (trimmedAddress.length < 32) {
      toast({
        title: 'Invalid Address',
        description: 'Contract addresses must be at least 32 characters',
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
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="mb-12 text-center">
          <h1 className="text-5xl font-bold text-foreground mb-4">
            Paper Trade Solana Tokens
          </h1>
          <p className="text-lg text-muted-foreground">
            Enter a contract address or search to start trading
          </p>
        </div>

        <Card className="p-8 mb-8">
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-3 text-foreground">
              Contract Address
            </label>
            <div className="flex gap-3">
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
                className="gap-2"
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
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3">
              <span className="text-sm text-muted-foreground">OR</span>
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

        {showSearchResults && (
          <div>
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Search className="h-6 w-6" />
              Search Results
              {hasSearchResults && (
                <span className="text-muted-foreground text-lg">
                  ({searchResults.results.length})
                </span>
              )}
            </h2>

            {isSearching ? (
              <Card className="p-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto text-muted-foreground animate-spin mb-4" />
                <p className="text-muted-foreground">Searching tokens...</p>
              </Card>
            ) : hasSearchResults ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.results.map((result) => (
                  <Card
                    key={result.tokenAddress}
                    className="p-4 hover-elevate cursor-pointer"
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
                          <span className="text-sm text-muted-foreground">
                            {result.symbol}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {result.tokenAddress}
                        </p>
                        {result.marketCap !== undefined && result.marketCap > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              MC: ${result.marketCap >= 1_000_000
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

        {!showSearchResults && (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <TrendingUp className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Ready to Trade</h3>
              <p className="text-muted-foreground">
                Enter a contract address above or search for tokens to get started with paper trading
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
