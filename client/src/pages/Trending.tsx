import { useQuery } from '@tanstack/react-query';
import { TokenCard } from '@/components/TokenCard';
import { TrendingUp, Loader2 } from 'lucide-react';
import type { Token } from '@shared/schema';

export default function Trending() {
  const { data, isLoading } = useQuery<{ tokens: Token[] }>({
    queryKey: ['/api/tokens/trending'],
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 60000, // Refetch every minute
  });

  const tokens = data?.tokens || [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2 flex items-center gap-3">
          <TrendingUp className="h-10 w-10 text-primary" />
          Trending Tokens
        </h1>
        <p className="text-muted-foreground">
          Top trending Solana tokens by 24h volume
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-20">
          <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
          <p className="text-xl text-muted-foreground">Loading trending tokens...</p>
        </div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-20">
          <TrendingUp className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-xl text-muted-foreground">No trending tokens found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {tokens.map((token) => (
            <TokenCard key={token.tokenAddress} token={token} />
          ))}
        </div>
      )}
    </div>
  );
}
