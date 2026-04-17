import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell } from '@/components/ui/data-cell';
import { ChainChip } from '@/components/ui/chain-chip';
import { Link } from 'wouter';
import { ArrowRight, TrendingUp, TrendingDown, RefreshCw, Waves } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Chain } from '@shared/schema';
import { cn } from '@/lib/utils';

interface WhaleActivity {
  id: string;
  walletAddress: string;
  walletAlias: string;
  tokenAddress: string;
  tokenSymbol: string;
  action: 'buy' | 'sell';
  amountNative: number;
  timestamp: string;
  chain: Chain;
}

export default function WhaleWatch() {
  const [chain, setChain] = useState<Chain>('base');

  const { data, isLoading, refetch } = useQuery<{ activity: WhaleActivity[] }>({
    queryKey: ['/api/whales/activity', chain],
    queryFn: async () => {
      const res = await fetch(`/api/whales/activity?chain=${chain}`);
      if (!res.ok) throw new Error('Failed to fetch whale activity');
      return res.json();
    },
  });

  const activity = data?.activity || [];

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Waves className="h-4 w-4 text-[var(--accent-premium)]" />
            <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">Smart Money</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
                Whale Watch
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Track smart money moves on {chain === 'base' ? 'Base' : 'Solana'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-1">
                <button
                  onClick={() => setChain('base')}
                  className={cn(
                    'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
                    chain === 'base'
                      ? 'bg-[var(--bg-base)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  Base
                </button>
                <button
                  onClick={() => setChain('solana')}
                  className={cn(
                    'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
                    chain === 'solana'
                      ? 'bg-[var(--bg-base)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  Solana
                </button>
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading} className="h-8 w-8">
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {isLoading && activity.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))
          ) : (
            activity.map((item) => {
              const isBuy = item.action === 'buy';
              return (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
                          isBuy
                            ? 'bg-[rgba(63,168,118,0.1)] border-[var(--border-gain)] text-[var(--accent-gain)]'
                            : 'bg-[rgba(194,77,77,0.1)] border-[var(--border-loss)] text-[var(--accent-loss)]'
                        )}
                      >
                        {isBuy ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[var(--text-primary)]">{item.walletAlias}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                          </Badge>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                          <span className={isBuy ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]'}>
                            {isBuy ? 'Bought' : 'Sold'}
                          </span>{' '}
                          <span className="font-medium text-[var(--text-primary)]">${item.tokenSymbol}</span>{' '}
                          for{' '}
                          <span className="font-mono tabular-nums text-[var(--text-primary)]">
                            {item.amountNative.toFixed(4)} {chain === 'base' ? 'ETH' : 'SOL'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <Link href={`/token/${item.tokenAddress}?chain=${chain}`}>
                      <Button size="sm" variant="outline" className="shrink-0">
                        Simulate
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })
          )}
          {!isLoading && activity.length === 0 && (
            <div className="text-center py-12">
              <Waves className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
              <p className="text-sm text-[var(--text-secondary)]">No whale activity found.</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">Check back later or switch chains.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
