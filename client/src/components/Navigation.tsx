import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TrendingUp, History, Trophy, User, LogOut, Wallet, Info, Search, Loader2, Microscope, BarChart3 } from 'lucide-react';
import { formatSol } from '@/lib/lamports';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import logoUrl from '@assets/simfilogo_1761226731940.png';

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  icon?: string;
  marketCap?: number;
  price?: number;
}

export function Navigation() {
  const [location, setLocation] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Clear search when navigating to main page
  useEffect(() => {
    if (location === '/') {
      setSearchQuery('');
      setDebouncedQuery('');
    }
  }, [location]);

  // ✅ UPDATED: Use new cached market search endpoint
  const { data: searchResults, isLoading: isSearching } = useQuery<{ results: SearchResult[] }>({
    queryKey: ['/api/market/search', debouncedQuery],
    queryFn: async () => {
      const response = await fetch(`/api/market/search?q=${encodeURIComponent(debouncedQuery)}`);
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
    staleTime: 30000, // Cache for 30 seconds (server also caches)
  });

  const handleTokenClick = (address: string) => {
    setSearchQuery('');
    setDebouncedQuery('');
    setLocation(`/token/${address}`);
  };

  const navItems = [
    { path: '/', label: 'Trade', icon: TrendingUp },
    { path: '/trending', label: 'Trending', icon: TrendingUp },
    { path: '/study', label: 'Study', icon: Microscope },
    { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { path: '/about', label: 'About', icon: Info },
  ];

  const showSearchBar = location !== '/';
  const hasSearchResults = searchResults && searchResults.results.length > 0;
  const showSearchResults = debouncedQuery.length >= 3;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-gradient-to-r from-primary/10 via-background to-chart-2/10 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/" className="flex items-center gap-2 hover-elevate rounded-md px-2 py-1" data-testid="link-home">
              <img src={logoUrl} alt="SimFi Logo" className="h-14 w-auto" />
            </Link>

            <div className="hidden md:flex gap-1">
              {navItems.map(item => (
                <Button
                  key={item.path}
                  variant={location === item.path ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setLocation(item.path)}
                  data-testid={`link-${item.label.toLowerCase()}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Search Bar - Only shown when NOT on main page */}
          {showSearchBar && (
            <div className="flex-1 max-w-md mx-4 relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search tokens..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-10 h-9"
                  data-testid="input-search-header"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Search Results Dropdown */}
              {showSearchResults && (
                <Card className="absolute top-full mt-2 w-full max-h-96 overflow-y-auto shadow-lg z-50">
                  {hasSearchResults ? (
                    <div className="p-2">
                      {searchResults.results.map((result) => (
                        <div
                          key={result.tokenAddress}
                          onClick={() => handleTokenClick(result.tokenAddress)}
                          className="flex items-center gap-3 p-3 hover-elevate active-elevate-2 rounded-md cursor-pointer"
                          data-testid={`search-result-${result.tokenAddress}`}
                        >
                          {result.icon && (
                            <img src={result.icon} alt={result.symbol} className="w-8 h-8 rounded-full" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{result.name}</div>
                            <div className="text-sm text-muted-foreground">{result.symbol}</div>
                          </div>
                          {result.marketCap && (
                            <div className="text-sm font-mono text-muted-foreground">
                              ${result.marketCap >= 1_000_000 
                                ? `${(result.marketCap / 1_000_000).toFixed(2)}M`
                                : result.marketCap >= 1_000
                                ? `${(result.marketCap / 1_000).toFixed(1)}K`
                                : result.marketCap.toFixed(0)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No tokens found</p>
                      <p className="text-xs mt-1">Try a different search term</p>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 shrink-0">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                    <User className="h-5 w-5" />
                    <div className="hidden sm:flex flex-col items-start">
                      <span className="text-sm font-medium">{user?.username}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatSol(user?.balance || 0)} SOL
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user?.username}</span>
                      <span className="font-mono text-xs text-muted-foreground font-normal">
                        {formatSol(user?.balance || 0)} SOL
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation('/portfolio')} data-testid="menu-portfolio">
                    <Wallet className="mr-2 h-4 w-4" />
                    Portfolio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation('/positions')} data-testid="menu-positions">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Positions
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation('/history')} data-testid="menu-history">
                    <History className="mr-2 h-4 w-4" />
                    History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation('/login')}
                  data-testid="button-login"
                >
                  Login
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setLocation('/register')}
                  data-testid="button-register"
                >
                  Register
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile navigation */}
        <div className="flex md:hidden gap-1 pb-2 overflow-x-auto">
          {navItems.map(item => (
            <Button
              key={item.path}
              variant={location === item.path ? "secondary" : "ghost"}
              size="sm"
              className="gap-2 whitespace-nowrap"
              onClick={() => setLocation(item.path)}
              data-testid={`link-mobile-${item.label.toLowerCase()}`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    </nav>
  );
}