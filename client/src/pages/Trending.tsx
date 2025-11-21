import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { formatPricePerTokenUSD, toBigInt } from '@/lib/lamports';
import { TrendingUp, ExternalLink } from 'lucide-react';

interface TrendingToken {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  buyerCount: number;
  sellerCount: number;
  totalActivity: number;
  currentPrice: string;
}

export default function Trending() {
  const { isAuthenticated } = useAuth();

  const { data: trendingData, isLoading } = useQuery<{ trending: TrendingToken[] }>({
    queryKey: ['/api/trending'],
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const trendingTokens = trendingData?.trending || [];

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center text-muted-foreground">Loading trending tokens...</div>
      </div>
    );
  }

  if (trendingTokens.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center text-muted-foreground">No trending tokens yet</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-8 w-8 text-primary" />
        <h1 className="text-4xl font-bold">Trending Tokens</h1>
      </div>

      <p className="text-muted-foreground">
        Based on activity from {trendingTokens.reduce((sum, t) => sum + t.buyerCount, 0)} traders across SimFi
      </p>

      <div className="grid gap-4">
        {trendingTokens.map((token, index) => (
          <Card key={token.tokenAddress} className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 font-bold text-primary">
                  #{index + 1}
                </div>
                <div>
                  <h3 className="text-lg font-bold" data-testid={`text-token-symbol-${token.tokenAddress}`}>
                    {token.tokenSymbol}
                  </h3>
                  <p className="text-sm text-muted-foreground">{token.tokenName}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                asChild
              >
                <Link href={`/token/${token.tokenAddress}`}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Current Price</p>
                  <p className="font-mono font-semibold" data-testid={`text-price-${token.tokenAddress}`}>
                    {formatPricePerTokenUSD(token.currentPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Buyers</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold" data-testid={`text-buyers-${token.tokenAddress}`}>
                      {token.buyerCount}
                    </span>
                    <Badge variant="default" className="text-xs">
                      +{token.buyerCount}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Sellers</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold" data-testid={`text-sellers-${token.tokenAddress}`}>
                      {token.sellerCount}
                    </span>
                    {token.sellerCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        +{token.sellerCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  asChild
                >
                  <Link href={`/token/${token.tokenAddress}`}>
                    View & Trade
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
