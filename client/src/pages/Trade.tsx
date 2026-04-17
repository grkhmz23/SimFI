import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Loader2, 
  ArrowRight, 
  TrendingUp, 
  Shield, 
  BarChart3, 
  Target,
  Coins, 
  GraduationCap, 
  ChevronDown,
  Award,
  Activity
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { useChain } from '@/lib/chain-context';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  icon?: string;
  marketCap?: number;
  price?: number;
}

const SearchBar = ({ 
  value, 
  onChange, 
  placeholder,
  isLoading 
}: { 
  value: string; 
  onChange: (v: string) => void; 
  placeholder?: string;
  isLoading?: boolean;
}) => {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input 
          placeholder={placeholder || "Search tokens..."}
          type="text" 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-card border border-border w-full h-12 rounded-xl text-foreground pl-11 pr-11 text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder-muted-foreground transition-all" 
        />
        {isLoading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary animate-spin" />
        )}
      </div>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="group h-full">
    <Card className="h-full p-5 bg-card border-border hover:border-primary/30 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
        {icon}
      </div>
      <h3 className="text-base font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  </div>
);

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
};

const itemVariants = {
  hidden: { y: 16, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.4, ease: "easeOut" } }
};

export default function Trade() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { activeChain } = useChain();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults, isLoading: isSearching } = useQuery<{ results: SearchResult[] }>({
    queryKey: ['/api/market/search', debouncedQuery, activeChain],
    queryFn: async () => {
      const response = await fetch(`/api/market/search?q=${encodeURIComponent(debouncedQuery)}&chain=${activeChain}`);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    enabled: debouncedQuery.length >= 3,
    staleTime: 30000,
  });

  const handleTokenClick = (address: string) => setLocation(`/token/${address}`);

  const hasSearchResults = searchResults && searchResults.results.length > 0;
  const showSearchResults = debouncedQuery.length >= 3;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center justify-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px]" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            className="max-w-3xl mx-auto text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={itemVariants}>
              <Badge className="mb-5 px-3 py-1.5 text-xs font-medium bg-primary/10 border-primary/20 text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2" />
                Live Paper Trading
              </Badge>
            </motion.div>

            <motion.h1 variants={itemVariants} className="text-4xl md:text-6xl font-semibold mb-4 tracking-tight">
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                SimFi
              </span>
            </motion.h1>

            <motion.p variants={itemVariants} className="text-xl md:text-2xl text-foreground mb-2 font-medium">
              Risk-Free DeFi Trading
            </motion.p>

            <motion.p variants={itemVariants} className="text-base text-muted-foreground max-w-xl mx-auto mb-8">
              Practice trading Base and Solana tokens with virtual ETH and SOL. Real market data, zero risk.
            </motion.p>

            <motion.div variants={itemVariants} className="mb-6">
              <p className="text-sm text-muted-foreground mb-3">
                Search by token name or contract address
              </p>
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search tokens..."
                isLoading={isSearching}
              />
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setLocation('/trending')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border hover:border-primary/30 hover:bg-muted transition-colors text-sm"
                >
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Trending
                </button>
                <button
                  onClick={() => setLocation('/leaderboard')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border hover:border-primary/30 hover:bg-muted transition-colors text-sm"
                >
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Leaderboard
                </button>
              </div>
            </motion.div>

            {showSearchResults && (
              <motion.div 
                className="max-w-2xl mx-auto mb-8 text-left"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {isSearching ? (
                  <Card className="p-6 text-center bg-card">
                    <Loader2 className="h-6 w-6 mx-auto text-primary animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Searching...</p>
                  </Card>
                ) : hasSearchResults ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {searchResults.results.map((result, index) => (
                      <motion.div
                        key={result.tokenAddress}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03 }}
                      >
                        <Card
                          className="p-3 cursor-pointer bg-card border-border hover:border-primary/30 transition-colors"
                          onClick={() => handleTokenClick(result.tokenAddress)}
                        >
                          <div className="flex items-center gap-3">
                            {result.icon && (
                              <img src={result.icon} alt={result.name} className="w-9 h-9 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{result.name}</span>
                                <Badge variant="outline" className="text-xs">{result.symbol}</Badge>
                              </div>
                              <p className="text-xs font-mono text-muted-foreground truncate">{result.tokenAddress}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <Card className="p-6 text-center bg-card">
                    <Search className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground text-sm">No tokens found for &quot;{debouncedQuery}&quot;</p>
                  </Card>
                )}
              </motion.div>
            )}

            {!showSearchResults && !isAuthenticated && (
              <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Button
                  size="lg"
                  onClick={() => setLocation('/register')}
                  className="gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-6"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setLocation('/about')}
                  className="gap-2 rounded-lg border-border hover:bg-muted px-6"
                >
                  Learn More
                </Button>
              </motion.div>
            )}

            {!showSearchResults && (
              <motion.div variants={itemVariants} className="mt-10 grid grid-cols-3 gap-6 max-w-md mx-auto">
                {[
                  { value: "5 ETH + 10 SOL", label: "Starting Balance" },
                  { value: "Live", label: "Market Data" },
                  { value: "Multi-Chain", label: "Base + Solana" },
                ].map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="text-xl md:text-2xl font-semibold text-foreground">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>

        {!showSearchResults && (
          <motion.div 
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ChevronDown className="h-6 w-6 text-muted-foreground" />
          </motion.div>
        )}
      </section>

      {/* Features */}
      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-semibold mb-2">Why SimFi?</h2>
            <p className="text-muted-foreground text-sm">The safest way to learn crypto trading</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <Coins className="h-5 w-5" />, title: "Virtual Currency", description: `Start with ${activeChain === 'solana' ? '10 SOL' : '5 ETH'} in paper balance. No real money at risk.` },
              { icon: <Activity className="h-5 w-5" />, title: "Real-Time Prices", description: "Trade with live market data from Base and Solana DEXs." },
              { icon: <Target className="h-5 w-5" />, title: "Leaderboard Ranks", description: "Compete with other traders and climb the global rankings." },
              { icon: <Shield className="h-5 w-5" />, title: "Zero Risk", description: "Learn from mistakes without financial consequences." },
              { icon: <BarChart3 className="h-5 w-5" />, title: "Track Progress", description: "Monitor your portfolio and refine your strategy." },
              { icon: <GraduationCap className="h-5 w-5" />, title: "Learn Trading", description: "Build confidence before trading with real capital." },
            ].map((feature, i) => (
              <FeatureCard key={i} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-semibold mb-3">Start Trading Today</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto text-sm">
              Join SimFi and practice trading with real market data in a risk-free environment.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                onClick={() => setLocation('/register')}
                className="gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-6"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setLocation('/leaderboard')}
                className="gap-2 rounded-lg border-border hover:bg-muted px-6"
              >
                <Award className="h-4 w-4" />
                View Leaderboard
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
