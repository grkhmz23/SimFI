import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingTokenCard } from '@/components/TrendingTokenCard';
import { ChainSelector, ChainBadge } from '@/components/ChainSelector';
import { useChain } from '@/lib/chain-context';
import { Flame, Sparkles, Clock, Loader2 } from 'lucide-react';
import type { Chain } from '@shared/schema';

interface TrendingResponse {
  trending: any[];
  count: number;
  cachedAt: number;
}

interface NewPairsResponse {
  newPairs: any[];
  ageHours: number;
  count: number;
  cachedAt: number;
}

interface HotResponse {
  hot: any[];
  count: number;
  cachedAt: number;
}

const AGE_FILTERS = [
  { label: '1h', value: 1 },
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
];

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

  const renderList = (tokens: any[], loading: boolean, showAge = false) => {
    if (loading) {
      return (
        <Card className="p-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin mb-3" />
          <p className="text-muted-foreground">Loading tokens...</p>
        </Card>
      );
    }

    if (!tokens || tokens.length === 0) {
      return (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No tokens found for this chain.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Try switching to {activeChain === 'base' ? 'Solana' : 'Base'} or check back later.
          </p>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {tokens.map((token, index) => (
          <TrendingTokenCard
            key={token.tokenAddress}
            token={token}
            rank={index + 1}
            showAge={showAge}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Flame className="h-8 w-8 text-primary" />
                Trending
              </h1>
              <p className="text-muted-foreground">
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
              <Sparkles className="h-4 w-4" />
              Trending
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2">
              <Clock className="h-4 w-4" />
              New Pairs
            </TabsTrigger>
            <TabsTrigger value="hot" className="gap-2">
              <Flame className="h-4 w-4" />
              Hot
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trending">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Top Trending Tokens</h2>
              <p className="text-sm text-muted-foreground">
                {trendingData?.count || 0} tokens found
              </p>
            </div>
            {renderList(trendingData?.trending || [], trendingLoading)}
          </TabsContent>

          <TabsContent value="new">
            <div className="mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-semibold">Recently Launched Pairs</h2>
                <div className="flex items-center gap-2">
                  {AGE_FILTERS.map((filter) => (
                    <Button
                      key={filter.value}
                      size="sm"
                      variant={ageHours === filter.value ? 'default' : 'outline'}
                      onClick={() => setAgeHours(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            {renderList(newPairsData?.newPairs || [], newPairsLoading, true)}
          </TabsContent>

          <TabsContent value="hot">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Hot Right Now</h2>
              <p className="text-sm text-muted-foreground">
                Sorted by volume / liquidity momentum
              </p>
            </div>
            {renderList(hotData?.hot || [], hotLoading)}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
