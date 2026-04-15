import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { useChain } from '@/lib/chain-context';
import { usePrice } from '@/lib/price-context';
import { ChainSelector } from '@/components/ChainSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  TrendingUp, 
  History, 
  Trophy, 
  User, 
  LogOut, 
  Wallet, 
  Info, 
  Search, 
  Loader2, 
  Microscope, 
  BarChart3, 
  Menu,
  X,
  Sparkles,
  Flame,
  ChevronDown,
  Users,
  Gift,
} from 'lucide-react';

// Custom whale icon since lucide doesn't export Whale
const WhaleIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 8c-3.3 0-6 2.7-6 6 0 1.5.5 2.8 1.4 3.8" />
    <path d="M18 14c0-3.3-2.7-6-6-6" />
    <path d="M12 20c4.4 0 8-3.6 8-8 0-2.1-.8-4-2.1-5.4" />
    <path d="M18 6c-1.7-1.7-4-2.6-6.4-2.5C8.5 3.7 5.8 5.3 4.2 7.8c-2.3 3.6-1.8 8.3 1.2 11.3" />
    <path d="M4 14c-1.1 0-2-.9-2-2s.9-2 2-2" />
    <path d="M20 10c1.1 0 2 .9 2 2s-.9 2-2 2" />
  </svg>
);
import { formatBalance, formatUSD as formatUsdValue } from '@/lib/token-format';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
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
  const { user, logout, isAuthenticated, getBalance } = useAuth();
  const { activeChain, nativeSymbol } = useChain();
  const { solPriceUSD, ethPriceUSD, getPrice } = usePrice();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Track scroll for header background
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    setMobileMenuOpen(false);
  }, [location]);

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
    staleTime: 30000,
  });

  const handleTokenClick = (address: string) => {
    setSearchQuery('');
    setDebouncedQuery('');
    setLocation(`/token/${address}`);
  };

  const navItems = [
    { path: '/', label: 'Trade', icon: TrendingUp },
    { path: '/trending', label: 'Trending', icon: Flame },
    { path: '/whales', label: 'Whales', icon: WhaleIcon },
    { path: '/study', label: 'Study', icon: Microscope },
    { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { path: '/about', label: 'About', icon: Info },
  ];

  const showSearchBar = location !== '/';
  const hasSearchResults = searchResults && searchResults.results.length > 0;
  const showSearchResults = debouncedQuery.length >= 3;

  return (
    <>
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled 
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-lg shadow-black/5" 
          : "bg-transparent"
      )}>
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo & Desktop Nav */}
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative"
                >
                  <img src={logoUrl} alt="SimFi Logo" className="h-10 w-auto" />
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
                </motion.div>
              </Link>

              {/* Desktop Navigation */}
              <div className="hidden lg:flex items-center gap-1">
                {navItems.map(item => {
                  const isActive = location === item.path;
                  return (
                    <motion.button
                      key={item.path}
                      onClick={() => setLocation(item.path)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2",
                        isActive 
                          ? "text-primary" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid={`link-${item.label.toLowerCase()}`}
                    >
                      <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                      {item.label}
                      
                      {/* Active indicator */}
                      {isActive && (
                        <motion.div
                          layoutId="activeNav"
                          className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg -z-10"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Search Bar - Only shown when NOT on main page */}
            {showSearchBar && (
              <div className="hidden md:block flex-1 max-w-md mx-4 relative">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    type="text"
                    placeholder="Search tokens..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10 h-10 bg-card/50 border-border/50 focus:border-primary/50 focus:bg-card rounded-full transition-all"
                    data-testid="input-search-header"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                  )}
                  
                  {/* Glow on focus */}
                  <div className="absolute inset-0 rounded-full bg-primary/5 opacity-0 group-focus-within:opacity-100 blur-xl transition-opacity -z-10" />
                </div>

                {/* Search Results Dropdown */}
                <AnimatePresence>
                  {showSearchResults && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full mt-2 w-full"
                    >
                      <Card className="max-h-96 overflow-y-auto bg-card/95 backdrop-blur-xl border-border/50 shadow-xl">
                        {hasSearchResults ? (
                          <div className="p-2">
                            {searchResults.results.map((result, index) => (
                              <motion.div
                                key={result.tokenAddress}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => handleTokenClick(result.tokenAddress)}
                                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors"
                                data-testid={`search-result-${result.tokenAddress}`}
                              >
                                {result.icon && (
                                  <img src={result.icon} alt={result.symbol} className="w-8 h-8 rounded-full ring-2 ring-border" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{result.name}</div>
                                  <div className="text-sm text-muted-foreground">{result.symbol}</div>
                                </div>
                                {result.marketCap && (
                                  <Badge variant="secondary" className="text-xs">
                                    ${result.marketCap >= 1_000_000 
                                      ? `${(result.marketCap / 1_000_000).toFixed(2)}M`
                                      : result.marketCap >= 1_000
                                      ? `${(result.marketCap / 1_000).toFixed(1)}K`
                                      : result.marketCap.toFixed(0)}
                                  </Badge>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 text-center text-muted-foreground">
                            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No tokens found</p>
                          </div>
                        )}
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Right Side - Chain Selector, Auth & Mobile Menu */}
            <div className="flex items-center gap-3">
              {/* Chain Selector - Always visible */}
              <ChainSelector variant="compact" />
              
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-3 px-3 py-2 rounded-full bg-card/50 border border-border/50 hover:border-primary/30 transition-all"
                      data-testid="button-user-menu"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                      <div className="hidden sm:flex flex-col items-start">
                        <span className="text-sm font-medium">{user?.username}</span>
                        <span className="font-mono text-xs text-primary">
                          {formatBalance(getBalance(activeChain), activeChain, 4)} {nativeSymbol}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ≈ {formatUsdValue(getBalance(activeChain), getPrice(activeChain), activeChain)}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
                    </motion.button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card/95 backdrop-blur-xl">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span>{user?.username}</span>
                        {/* Active Chain Balance */}
                        <span className="font-mono text-xs text-primary font-normal">
                          {formatBalance(getBalance(activeChain), activeChain, 4)} {nativeSymbol}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground font-normal">
                          ≈ {formatUsdValue(getBalance(activeChain), getPrice(activeChain), activeChain)}
                        </span>
                        {/* Other Chain Balance */}
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground">
                            {activeChain === 'base' ? 'Solana' : 'Base'} Balance
                          </span>
                          <span className="font-mono text-xs text-muted-foreground block">
                            {formatBalance(
                              getBalance(activeChain === 'base' ? 'solana' : 'base'),
                              activeChain === 'base' ? 'solana' : 'base',
                              4
                            )} {activeChain === 'base' ? 'SOL' : 'ETH'}
                          </span>
                        </div>
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
                    <DropdownMenuItem onClick={() => setLocation('/referrals')} data-testid="menu-referrals">
                      <Gift className="mr-2 h-4 w-4" />
                      Referrals
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive" data-testid="menu-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation('/login')}
                    className="rounded-full"
                    data-testid="button-login"
                  >
                    Login
                  </Button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setLocation('/register')}
                    className="px-4 py-2 rounded-full text-sm font-medium bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow"
                    data-testid="button-register"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Get Started
                    </span>
                  </motion.button>
                </div>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-card/50 transition-colors"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-16 left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-border z-40 lg:hidden"
            >
              <div className="container mx-auto px-4 py-4">
                {/* Mobile Search */}
                {showSearchBar && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search tokens..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 h-10 rounded-full"
                    />
                  </div>
                )}

                {/* Mobile Nav Items */}
                <div className="space-y-1">
                  {navItems.map(item => {
                    const isActive = location === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => setLocation(item.path)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                          isActive 
                            ? "bg-primary/10 text-primary" 
                            : "hover:bg-card/50 text-foreground"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Mobile Auth Buttons */}
                {!isAuthenticated && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-full"
                      onClick={() => setLocation('/login')}
                    >
                      Login
                    </Button>
                    <Button
                      className="flex-1 rounded-full bg-gradient-to-r from-primary to-accent"
                      onClick={() => setLocation('/register')}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Get Started
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Spacer for fixed nav */}
      <div className="h-16" />
    </>
  );
}
