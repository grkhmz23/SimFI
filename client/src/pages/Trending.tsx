import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataCell } from '@/components/ui/data-cell';
import { ChainChip } from '@/components/ui/chain-chip';
import { ChainSelector, ChainBadge } from '@/components/ChainSelector';
import { useChain } from '@/lib/chain-context';
import { formatCompactNumber, formatMarketCap, formatPercentage } from '@/lib/token-format';
import { useLocation } from 'wouter';
import { TrendingUp, Activity, Clock, ArrowUpRight, ArrowDownRight, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendingToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  icon?: string;
  pairCreatedAt?: number;
}

interface TrendingResponse {
  trending: TrendingToken[];
  count: number;
  cachedAt: number;
}

interface NewPairsResponse {
  newPairs: TrendingToken[];
  ageHours: number;
  count: number;
  cachedAt: number;
}

interface HotResponse {
  hot: TrendingToken[];
  count: number;
  cachedAt: number;
}

const AGE_FILTERS = [
  { label: '1h', value: 1 },
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
];

function TokenRow({ token, rank, showAge = false }: { token: TrendingToken; rank?: number; showAge?: boolean }) {
  const [, setLocation] = useLocation();
  const priceChange = token.priceChange24h || 0;
  const isPositive = priceChange >= 0;

  const getAgeText = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    const minutes = Math.floor((Date.now() - timestamp) / (1000 * 60));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div
      onClick={() => setLocation(`/token/${token.tokenAddress}`)}
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-[var(--border-subtle)] last:border-b-0',
        'hover:bg-[var(--bg-hover)]'
      )}
    >
      {rank !== undefined && (
        <span className="w-6 text-right text-xs font-mono tabular-nums text-[var(--text-tertiary)] shrink-0">
          {rank}
        </span>
      )}

      {token.icon ? (
        <img
          src={token.icon}
          alt={token.symbol}
          className="w-8 h-8 rounded-full shrink-0"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-[var(--bg-base)] flex items-center justify-center text-xs font-bold text-[var(--text-secondary)] shrink-0">
          {token.symbol.slice(0, 2)}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{token.name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {token.symbol}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {token.marketCap > 0 && (
            <span className="text-xs text-[var(--text-tertiary)] font-mono tabular-nums">
              {formatMarketCap(token.marketCap)}
            </span>
          )}
          {token.liquidity > 0 && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
              <Droplets className="h-3 w-3" />
              <span className="font-mono tabular-nums">{formatCompactNumber(token.liquidity)}</span>
            </span>
          )}
          {showAge && token.pairCreatedAt && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
              <Clock className="h-3 w-3" />
              {getAgeText(token.pairCreatedAt)}
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        <DataCell
          value={formatPercentage(priceChange)}
          variant={isPositive ? 'gain' : 'loss'}
          className="text-sm font-semibold"
        />
        {token.priceUsd > 0 && (
          <p className="text-xs text-[var(--text-tertiary)] font-mono tabular-nums mt-0.5">
            ${token.priceUsd < 0.000001 ? token.priceUsd.toExponential(2) : token.priceUsd < 0.01 ? token.priceUsd.toFixed(6) : token.priceUsd.toFixed(4)}
          </p>
        )}
      </div>

      <ArrowUpRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function TokenList({ tokens, loading, showAge = false }: { tokens: TrendingToken[]; loading: boolean; showAge?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
            <Skeleton className="w-6 h-4" />
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="w-32 h-4" />
              <Skeleton className="w-20 h-3" />
            </div>
            <Skeleton className="w-16 h-4" />
          </div>
        ))}
      </div>
    );
  }

  if (!tokens || tokens.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-[var(--text-secondary)]">No tokens found for this chain.</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">Try switching chains or check back later.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      {tokens.map((token, index) => (
        <TokenRow key={token.tokenAddress} token={token} rank={index + 1} showAge={showAge} />
      ))}
    </div>
  );
}

export default function Trending() {
  const { activeChain } = useChain();
  const [ageHours, setAgeHours] = useState(6);

  const { data: trendingData, isLoading: trendingLoading } = useQuery<TrendingResponse>({
    queryKey: ['/api/market/trending', activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/market/trending?chain=${activeChain}&limit=20`);
      if (!res.ok) throw new Error('Failed to fetch trending');
      return res.json();
    },
  });

  const { data: newPairsData, isLoading: newPairsLoading } = useQuery<NewPairsResponse>({
    queryKey: ['/api/market/new-pairs', activeChain, ageHours],
    queryFn: async () => {
      const res = await fetch(`/api/market/new-pairs?chain=${activeChain}&age=${ageHours}`);
      if (!res.ok) throw new Error('Failed to fetch new pairs');
      return res.json();
    },
  });

  const { data: hotData, isLoading: hotLoading } = useQuery<HotResponse>({
    queryKey: ['/api/market/hot', activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/market/hot?chain=${activeChain}&limit=20`);
      if (!res.ok) throw new Error('Failed to fetch hot tokens');
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-[var(--accent-gain)]" />
                <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">Markets</span>
              </div>
              <h1 className="font-serif text-3xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
                Trending
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Discover the hottest tokens on {activeChain === 'base' ? 'Base' : 'Solana'}
              </p>
            </div>
            <ChainSelector variant="pill" />
          </div>
          <div className="flex items-center gap-2">
            <ChainBadge chain={activeChain} />
            <Badge variant="secondary">Live Data</Badge>
          </div>
        </div>

        <Tabs defaultValue="trending" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="trending" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Trending
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2">
              <Clock className="h-4 w-4" />
              New Pairs
            </TabsTrigger>
            <TabsTrigger value="hot" className="gap-2">
              <Activity className="h-4 w-4" />
              Hot
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trending">
            <Card>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">Top Trending Tokens</h2>
                <span className="text-xs text-[var(--text-tertiary)] font-mono tabular-nums">
                  {trendingData?.count || 0} tokens
                </span>
              </div>
              <TokenList tokens={trendingData?.trending || []} loading={trendingLoading} />
            </Card>
          </TabsContent>

          <TabsContent value="new">
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] gap-3">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">Recently Launched Pairs</h2>
                <div className="flex items-center gap-1">
                  {AGE_FILTERS.map((filter) => (
                    <Button
                      key={filter.value}
                      size="sm"
                      variant={ageHours === filter.value ? 'default' : 'outline'}
                      onClick={() => setAgeHours(filter.value)}
                      className="h-7 text-xs"
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>
              <TokenList tokens={newPairsData?.newPairs || []} loading={newPairsLoading} showAge />
            </Card>
          </TabsContent>

          <TabsContent value="hot">
            <Card>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">Hot Right Now</h2>
                <span className="text-xs text-[var(--text-tertiary)]">Sorted by volume / liquidity momentum</span>
              </div>
              <TokenList tokens={hotData?.hot || []} loading={hotLoading} />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
