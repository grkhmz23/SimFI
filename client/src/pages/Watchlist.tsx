import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWatchlist } from '@/lib/watchlist-context';
import { useAuth } from '@/lib/auth-context';
import { useChain } from '@/lib/chain-context';
import { usePrice } from '@/lib/price-context';
import { formatUsdText, formatPct } from '@/lib/format';
import { Bookmark, BookmarkX, ExternalLink, LogIn, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Token, Chain } from '@shared/schema';

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  }),
};

interface EnrichedWatchlistItem {
  id: string;
  chain: Chain;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  price: number;
  priceUsd: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  icon?: string;
}

export default function Watchlist() {
  const { isAuthenticated } = useAuth();
  const { activeChain } = useChain();
  const { getPrice } = usePrice();
  const { items, isLoading, removeFromWatchlist } = useWatchlist();
  const [, setLocation] = useLocation();
  const nativePriceUSD = getPrice(activeChain);

  // Group items by chain for batch price fetching
  const itemsByChain = useMemo(() => {
    const grouped = new Map<Chain, typeof items>();
    for (const item of items) {
      const list = grouped.get(item.chain as Chain) || [];
      list.push(item);
      grouped.set(item.chain as Chain, list);
    }
    return grouped;
  }, [items]);

  // Fetch current prices for all watched tokens
  const { data: priceData, isLoading: pricesLoading } = useQuery<{
    tokens: (Token & { cached?: boolean; ageMs?: number })[];
  }>({
    queryKey: ['watchlist-prices', items.map((i) => i.tokenAddress).join(',')],
    queryFn: async () => {
      const results: Token[] = [];
      for (const [chain, chainItems] of itemsByChain) {
        if (chainItems.length === 0) continue;
        const addresses = chainItems.map((i) => i.tokenAddress).join(',');
        const res = await fetch(
          `/api/market/tokens?addresses=${addresses}&chain=${chain}`,
          { credentials: 'include' }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.tokens) results.push(...data.tokens);
        }
      }
      return { tokens: results };
    },
    enabled: items.length > 0,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const enrichedItems = useMemo(() => {
    const priceMap = new Map<string, Token>();
    for (const t of priceData?.tokens || []) {
      priceMap.set(t.tokenAddress, t);
    }

    return items.map((item) => {
      const fresh = priceMap.get(item.tokenAddress);
      const priceNative = fresh?.price ?? 0;
      const priceUsd =
        fresh?.priceUsd !== undefined
          ? fresh.priceUsd
          : priceNative > 0 && nativePriceUSD
            ? (priceNative / (item.chain === 'solana' ? 1e9 : 1e18)) * nativePriceUSD
            : 0;

      return {
        id: item.id,
        chain: item.chain as Chain,
        tokenAddress: item.tokenAddress,
        tokenName: item.tokenName,
        tokenSymbol: item.tokenSymbol,
        decimals: item.decimals,
        price: priceNative,
        priceUsd,
        priceChange24h: fresh?.priceChange24h || 0,
        marketCap: fresh?.marketCap || 0,
        volume24h: fresh?.volume24h || 0,
        icon: fresh?.icon,
      };
    });
  }, [items, priceData, nativePriceUSD]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="min-h-[60vh] flex items-center justify-center">
            <Card className="card-raised p-12 text-center max-w-md">
              <LogIn className="h-16 w-16 mx-auto text-[var(--text-secondary)] mb-6" />
              <h2 className="text-3xl font-bold mb-4 text-[var(--text-primary)]">Login Required</h2>
              <p className="text-[var(--text-secondary)] mb-8">
                You need to be logged in to save and track tokens on your watchlist
              </p>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={() => setLocation('/login')}>
                  Login
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setLocation('/register')}>
                  Get Started
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-20 lg:pb-0">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-medium text-[var(--text-primary)] mb-2">
            Watchlist
          </h1>
          <p className="text-[var(--text-secondary)]">
            Track tokens you're watching across Solana and Base
          </p>
        </div>

        {isLoading || pricesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="card-raised h-40 skeleton-shimmer" />
            ))}
          </div>
        ) : enrichedItems.length === 0 ? (
          <Card className="card-raised p-12 text-center">
            <Bookmark className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" strokeWidth={1.5} />
            <h3 className="text-xl font-medium text-[var(--text-primary)] mb-2">Your watchlist is empty</h3>
            <p className="text-[var(--text-secondary)] mb-6">
              Save tokens from Trending, Alpha Desk, or any token page to track them here.
            </p>
            <Button onClick={() => setLocation('/trade')}>Explore Tokens</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrichedItems.map((item, index) => (
              <motion.div
                key={item.id}
                custom={index}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                <Card className="card-raised h-full flex flex-col hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                  onClick={() => setLocation(`/token/${item.tokenAddress}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {item.icon ? (
                          <img
                            src={item.icon}
                            alt={item.tokenSymbol}
                            className="h-10 w-10 rounded-lg object-cover shrink-0"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-[var(--bg-raised)] flex items-center justify-center shrink-0 text-sm font-bold text-[var(--text-tertiary)]">
                            {item.tokenSymbol.slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">
                            {item.tokenSymbol}
                          </h3>
                          <p className="text-sm text-[var(--text-secondary)] truncate">
                            {item.tokenName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">
                          {item.chain}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWatchlist(item.id);
                          }}
                        >
                          <BookmarkX className="h-4 w-4 text-[var(--accent-loss)]" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col gap-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Price</p>
                        <p className="font-mono text-xl text-[var(--text-primary)]">
                          {formatUsdText(item.priceUsd)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">24h</p>
                        <div className={"font-mono text-sm " + (item.priceChange24h >= 0 ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]')}>
                          {item.priceChange24h >= 0 ? '+' : ''}
                          {formatPct(item.priceChange24h)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border-subtle)]">
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-0.5">Market Cap</p>
                        <p className="font-mono text-sm text-[var(--text-secondary)]">
                          {item.marketCap > 0 ? formatUsdText(item.marketCap) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-0.5">Volume (24h)</p>
                        <p className="font-mono text-sm text-[var(--text-secondary)]">
                          {item.volume24h > 0 ? formatUsdText(item.volume24h) : '—'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
