import { useQuery } from '@tanstack/react-query';
import { TokenCard } from '@/components/TokenCard';
import { TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Token } from '@shared/schema';

export default function Trending() {
  const { data, isLoading } = useQuery<{ tokens: Token[]; error?: string; needsAuth?: boolean; source?: string }>({
    queryKey: ['/api/tokens/trending'],
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 60000, // Refetch every minute
  });

  const tokens = data?.tokens || [];
  const needsAuth = data?.needsAuth || false;
  const source = data?.source || 'axiom.trade';

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2 flex items-center gap-3">
          <TrendingUp className="h-10 w-10 text-primary" />
          Trending Tokens
        </h1>
        <p className="text-muted-foreground">
          Top trending Solana tokens from {source}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-20">
          <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
          <p className="text-xl text-muted-foreground">Loading trending tokens...</p>
        </div>
      ) : needsAuth ? (
        <Card className="p-8 text-center max-w-2xl mx-auto">
          <AlertCircle className="h-16 w-16 mx-auto text-yellow-500 mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-3">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">
            To view trending tokens from axiom.trade, you need to authenticate first.
          </p>
          <div className="bg-muted p-4 rounded-md text-left text-sm font-mono">
            <p className="text-foreground mb-2">Run in terminal:</p>
            <code className="text-primary">python3 server/axiom_auth.py</code>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            You'll need your axiom.trade account credentials and an OTP code from email.
          </p>
        </Card>
      ) : tokens.length === 0 ? (
        <div className="text-center py-20">
          <TrendingUp className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-xl text-muted-foreground">No trending tokens found</p>
          {data?.error && (
            <p className="text-sm text-red-500 mt-2">{data.error}</p>
          )}
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
