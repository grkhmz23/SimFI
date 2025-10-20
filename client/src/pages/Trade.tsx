import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { TokenCard } from '@/components/TokenCard';
import { useTokens } from '@/lib/websocket';
import { Search, Sparkles, GraduationCap, CheckCircle2, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  icon?: string;
  marketCap?: number;
  price?: number;
}

export default function Trade() {
  const tokens = useTokens();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search API call
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

  const hasSearchResults = searchResults && searchResults.results.length > 0;
  const showSearchResults = debouncedQuery.length >= 3;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Live Token Trading</h1>
        <p className="text-muted-foreground">
          Real-time pump.fun tokens with paper trading
        </p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tokens (name, symbol, or address)..."
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

      {showSearchResults && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Search className="h-6 w-6" />
            Search Results
            {hasSearchResults && <span className="text-muted-foreground text-lg">({searchResults.results.length})</span>}
          </h2>
          {isSearching ? (
            <div className="text-center py-12">
              <Loader2 className="h-12 w-12 mx-auto text-muted-foreground animate-spin mb-4" />
              <p className="text-muted-foreground">Searching tokens...</p>
            </div>
          ) : hasSearchResults ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {searchResults.results.map((result) => (
                <TokenCard
                  key={result.tokenAddress}
                  token={{
                    tokenAddress: result.tokenAddress,
                    name: result.name,
                    symbol: result.symbol,
                    marketCap: result.marketCap || 0,
                    price: result.price || 0,
                    creator: 'N/A',
                    timestamp: new Date().toISOString(),
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-lg border">
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {debouncedQuery.length < 3 
                  ? 'Type at least 3 characters to search' 
                  : `No tokens found for "${debouncedQuery}"`}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Try searching by token name, symbol, or contract address
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-x divide-border">
        {/* New Tokens Column */}
        <div className="space-y-4 pr-0 lg:pr-6">
          <h2 className="text-xl font-semibold flex items-center gap-2 pb-4 border-b border-border" data-testid="section-new">
            <Sparkles className="h-5 w-5 text-primary" />
            New Pairs
            <span className="text-muted-foreground text-sm ml-auto">({tokens.new.length})</span>
          </h2>
          {tokens.new.length === 0 ? (
            <div className="text-center py-12">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Waiting for new tokens...
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.new.map((token) => (
                <TokenCard key={token.tokenAddress} token={token} />
              ))}
            </div>
          )}
        </div>

        {/* About to Graduate Column */}
        <div className="space-y-4 px-0 lg:px-6 mt-8 lg:mt-0">
          <h2 className="text-xl font-semibold flex items-center gap-2 pb-4 border-b border-border" data-testid="section-graduating">
            <GraduationCap className="h-5 w-5 text-primary" />
            Final Stretch
            <span className="text-muted-foreground text-sm ml-auto">({tokens.graduating.length})</span>
          </h2>
          {tokens.graduating.length === 0 ? (
            <div className="text-center py-12">
              <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                No tokens yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.graduating.map((token) => (
                <TokenCard key={token.tokenAddress} token={token} />
              ))}
            </div>
          )}
        </div>

        {/* Graduated Column */}
        <div className="space-y-4 pl-0 lg:pl-6 mt-8 lg:mt-0">
          <h2 className="text-xl font-semibold flex items-center gap-2 pb-4 border-b border-border" data-testid="section-graduated">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Migrated
            <span className="text-muted-foreground text-sm ml-auto">({tokens.graduated.length})</span>
          </h2>
          {tokens.graduated.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                No graduated tokens yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.graduated.map((token) => (
                <TokenCard key={token.tokenAddress} token={token} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
