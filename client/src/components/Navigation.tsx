import { useState, useEffect, useRef } from 'react';
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
import { TrendingUp, Home, BarChart3, History, Trophy, User, LogOut, Search, X, Wallet, Flame } from 'lucide-react';
import { formatSol } from '@/lib/lamports';
import { useQuery } from '@tanstack/react-query';
import logoUrl from '@assets/Gemini_Generated_Image_psjmlkpsjmlkpsjm_1761162060724.png';

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  icon?: string;
  description?: string;
}

export function Navigation() {
  const [location, setLocation] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { path: '/', label: 'Trade', icon: TrendingUp },
    { path: '/trending', label: 'Trending', icon: Flame },
    { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  ];

  // Search tokens via API
  const { data: searchData } = useQuery<{ results: SearchResult[] }>({
    queryKey: [`/api/tokens/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length >= 3,
  });

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show results when search data is available
  useEffect(() => {
    if (searchData?.results && searchQuery.length >= 3) {
      setShowResults(true);
    }
  }, [searchData, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleTokenClick = (address: string) => {
    setLocation(`/token/${address}`);
    setSearchQuery('');
    setShowResults(false);
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-gradient-to-r from-primary/10 via-background to-chart-2/10 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <Link href="/" className="flex items-center gap-2 hover-elevate rounded-md px-2 py-1 shrink-0" data-testid="link-home">
              <img src={logoUrl} alt="SimFi Logo" className="h-10 w-auto" style={{ mixBlendMode: 'multiply' }} />
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

            {/* Search Bar */}
            <div className="hidden lg:block flex-1 max-w-md relative" ref={searchRef}>
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search tokens by name or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchQuery.length >= 3 && setShowResults(true)}
                  className="pl-9 pr-9"
                  data-testid="input-search"
                />
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => {
                      setSearchQuery('');
                      setShowResults(false);
                    }}
                    data-testid="button-clear-search"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </form>

              {/* Search Results Dropdown */}
              {showResults && searchQuery.length >= 3 && (
                <Card className="absolute top-full mt-2 w-full max-h-96 overflow-y-auto z-50">
                  {searchData?.results && searchData.results.length > 0 ? (
                    <div className="p-2">
                      {searchData.results.map((result) => (
                        <button
                          key={result.tokenAddress}
                          onClick={() => handleTokenClick(result.tokenAddress)}
                          className="w-full text-left p-3 rounded-md hover-elevate active-elevate-2 flex items-center gap-3"
                          data-testid={`search-result-${result.tokenAddress}`}
                        >
                          {result.icon && (
                            <img
                              src={result.icon}
                              alt={result.name}
                              className="w-8 h-8 rounded-full"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{result.name}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {result.tokenAddress}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No tokens found
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>

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
