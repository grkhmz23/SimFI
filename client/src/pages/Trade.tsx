import { useState, useEffect, useRef, memo } from 'react';
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
  Rocket, 
  Trophy, 
  Coins, 
  GraduationCap, 
  ChevronDown, 
  Sparkles,
  Flame
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

// =============================================================================
// ANIMATED SEARCH BAR
// =============================================================================
const AnimatedSearchBar = ({ 
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
    <div className="relative flex items-center justify-center w-full max-w-2xl mx-auto">
      <div className="relative flex items-center justify-center group w-full">
        {/* Glow layers */}
        <div className="absolute z-[-1] overflow-hidden h-full w-full rounded-full blur-[3px] 
          before:absolute before:content-[''] before:z-[-2] before:w-[999px] before:h-[999px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[60deg]
          before:bg-[conic-gradient(#000,hsl(172,81%,55%)_5%,#000_38%,#000_50%,hsl(265,80%,60%)_60%,#000_87%)] before:transition-all before:duration-[2000ms]
          group-hover:before:rotate-[-120deg] group-focus-within:before:rotate-[420deg] group-focus-within:before:duration-[4000ms]" />
        <div className="absolute z-[-1] overflow-hidden h-full w-full rounded-full blur-[2px] 
          before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[83deg]
          before:bg-[conic-gradient(rgba(0,0,0,0)_0%,hsl(172,60%,70%),rgba(0,0,0,0)_8%,rgba(0,0,0,0)_50%,hsl(265,60%,70%),rgba(0,0,0,0)_58%)]
          before:transition-all before:duration-[2000ms] group-hover:before:rotate-[-97deg] group-focus-within:before:rotate-[443deg] group-focus-within:before:duration-[4000ms]" />

        {/* Input */}
        <div className="relative w-full">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
          <input 
            placeholder={placeholder || "Search tokens..."}
            type="text" 
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-card/90 backdrop-blur-sm border-2 border-border/50 w-full h-14 rounded-full text-foreground pl-14 pr-14 text-base focus:outline-none focus:border-primary/50 placeholder-muted-foreground transition-all" 
          />
          {isLoading && (
            <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 h-5 w-5 text-primary animate-spin" />
          )}
          <div className="pointer-events-none w-[30px] h-[20px] absolute bg-primary top-[10px] left-[5px] blur-2xl opacity-40 transition-all duration-[2000ms] group-hover:opacity-0 rounded-full" />
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// GRADIENT BUTTON
// =============================================================================
const GradientButton = ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className={cn(
      "relative px-8 py-4 rounded-full font-semibold text-lg overflow-hidden",
      "bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%]",
      "hover:bg-[position:100%_0] transition-all duration-500",
      "text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40",
      className
    )}
  >
    <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
  </motion.button>
);

// =============================================================================
// FEATURE CARD
// =============================================================================
const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <motion.div 
    className="group relative"
    whileHover={{ y: -5 }}
    transition={{ duration: 0.2 }}
  >
    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-accent to-primary rounded-2xl blur opacity-0 group-hover:opacity-30 transition duration-500" />
    <Card className="relative h-full p-6 bg-card border-border hover:border-primary/50 transition-all duration-300">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  </motion.div>
);

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

const itemVariants = {
  hidden: { y: 30, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};

export default function Trade() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const { activeChain } = useChain();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 500);
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
    <div className="min-h-screen">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-background to-muted" />

      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Soft radial glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px]" />
        </div>

        {/* Content */}
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            className="max-w-4xl mx-auto text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={itemVariants}>
              <Badge className="mb-6 px-4 py-2 text-sm bg-primary/10 border-primary/30 backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                Live Paper Trading
              </Badge>
            </motion.div>

            <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-chart-3 bg-clip-text text-transparent">
                SimFi
              </span>
            </motion.h1>

            <motion.p variants={itemVariants} className="text-2xl md:text-3xl text-foreground mb-2">
              Risk-Free DeFi Trading
            </motion.p>

            <motion.p variants={itemVariants} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Practice trading Base and Solana memecoins risk-free with virtual ETH and SOL. Master your strategy, compete on leaderboards, and climb the ranks.
            </motion.p>

            {/* Animated Search Bar */}
            <motion.div variants={itemVariants} className="mb-8">
              <p className="text-sm text-muted-foreground mb-3">
                Enter a token contract address or name to start trading
              </p>
              <AnimatedSearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search tokens by name or address..."
                isLoading={isSearching}
              />
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setLocation('/trending')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border/50 hover:border-primary/50 hover:bg-card transition-all text-sm"
                >
                  <Flame className="h-4 w-4 text-primary" />
                  Browse Trending
                </button>
                <button
                  onClick={() => setLocation('/leaderboard')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border/50 hover:border-primary/50 hover:bg-card transition-all text-sm"
                >
                  <Trophy className="h-4 w-4 text-primary" />
                  Leaderboard
                </button>
              </div>
            </motion.div>

            {/* Search Results */}
            {showSearchResults && (
              <motion.div 
                className="max-w-2xl mx-auto mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {isSearching ? (
                  <Card className="p-8 text-center bg-card/90 backdrop-blur">
                    <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Searching tokens...</p>
                  </Card>
                ) : hasSearchResults ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {searchResults.results.map((result, index) => (
                      <motion.div
                        key={result.tokenAddress}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card
                          className="p-4 cursor-pointer bg-card/90 backdrop-blur hover:bg-card hover:border-primary/50 transition-all"
                          onClick={() => handleTokenClick(result.tokenAddress)}
                        >
                          <div className="flex items-center gap-3">
                            {result.icon && (
                              <img src={result.icon} alt={result.name} className="w-10 h-10 rounded-full ring-2 ring-border" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                            <div className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold truncate">{result.name}</span>
                                <Badge variant="outline" className="text-xs">{result.symbol}</Badge>
                              </div>
                              <p className="text-xs font-mono text-muted-foreground truncate">{result.tokenAddress}</p>
                              {result.marketCap !== undefined && result.marketCap > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  <TrendingUp className="h-3 w-3 text-green-500" />
                                  <span className="text-sm font-semibold text-green-500">
                                    ${result.marketCap >= 1_000_000 ? `${(result.marketCap / 1_000_000).toFixed(2)}M` : result.marketCap >= 1_000 ? `${(result.marketCap / 1_000).toFixed(1)}K` : result.marketCap.toFixed(0)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <ArrowRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center bg-card/90 backdrop-blur">
                    <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No tokens found for "{debouncedQuery}"</p>
                  </Card>
                )}
              </motion.div>
            )}

            {/* Trending CTA */}
            {!showSearchResults && (
              <motion.div variants={itemVariants} className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setLocation('/trending')}
                  className="gap-2 rounded-full border-primary/30 hover:border-primary"
                >
                  <Flame className="h-4 w-4 text-orange-500" />
                  Explore Trending Tokens
                </Button>
              </motion.div>
            )}

            {/* CTAs */}
            {!isAuthenticated && !showSearchResults && (
              <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <GradientButton onClick={() => setLocation('/register')}>
                  <Rocket className="h-5 w-5" />
                  Get Started Free
                </GradientButton>
                <motion.button
                  onClick={() => setLocation('/about')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-4 rounded-full font-semibold border-2 border-border hover:border-primary/50 bg-card/50 backdrop-blur transition-all flex items-center gap-2"
                >
                  Learn More
                  <ArrowRight className="h-5 w-5" />
                </motion.button>
              </motion.div>
            )}

            {/* Stats */}
            {!showSearchResults && (
              <motion.div variants={itemVariants} className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto">
                {[
                  { value: "5 ETH + 10 SOL", label: "Starting Balance" },
                  { value: "6h", label: "Trading Periods" },
                  { value: "Ranks", label: "Leaderboard" },
                ].map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        {!showSearchResults && (
          <motion.div 
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ChevronDown className="h-8 w-8 text-muted-foreground" />
          </motion.div>
        )}
      </section>

      {/* ===== FEATURES SECTION ===== */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge className="mb-4">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Trade on SimFi?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The safest way to learn crypto trading
            </p>
          </motion.div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={containerVariants}
          >
            {[
              { icon: <Coins className="h-6 w-6 text-primary" />, title: "Virtual Currency", description: `Start with ${activeChain === 'solana' ? '10 SOL' : '5 ETH'} of virtual currency. No real money at risk.` },
              { icon: <TrendingUp className="h-6 w-6 text-primary" />, title: "Real-Time Prices", description: `Trade real tokens with live market data from ${activeChain === 'solana' ? 'pump.fun' : 'Base DEXs'}.` },
              { icon: <Trophy className="h-6 w-6 text-primary" />, title: "Win Leaderboard Ranks", description: "Top traders every 6 hours get featured on the global leaderboard." },
              { icon: <Shield className="h-6 w-6 text-primary" />, title: "Zero Risk", description: "Learn from mistakes without financial consequences." },
              { icon: <BarChart3 className="h-6 w-6 text-primary" />, title: "Track Progress", description: "Monitor your portfolio and improve your strategy." },
              { icon: <GraduationCap className="h-6 w-6 text-primary" />, title: "Learn Trading", description: "Build confidence before trading with real money." },
            ].map((feature, i) => (
              <motion.div key={i} variants={itemVariants}>
                <FeatureCard {...feature} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 max-w-4xl relative">
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Sparkles className="h-12 w-12 text-primary mx-auto mb-6" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Start Trading?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join SimFi today and start your journey to becoming a skilled trader
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <GradientButton onClick={() => setLocation('/register')}>
                <Rocket className="h-5 w-5" />
                Get Started Free
              </GradientButton>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setLocation('/leaderboard')}
                className="gap-2 rounded-full"
              >
                <Trophy className="h-5 w-5" />
                View Leaderboard
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}