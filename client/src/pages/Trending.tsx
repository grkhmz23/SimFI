import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import type { Token } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Link } from 'wouter';

interface ExtendedToken extends Token {
  volume24h?: number;
  priceChange24h?: number;
}

function formatPrice(lamports: number): string {
  const solPrice = lamports / 1_000_000_000;
  if (solPrice < 0.00001) {
    return solPrice.toExponential(2) + ' SOL';
  }
  return solPrice.toFixed(8) + ' SOL';
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return '$' + (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (num >= 1_000_000) {
    return '$' + (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return '$' + (num / 1_000).toFixed(2) + 'K';
  }
  return '$' + num.toFixed(2);
}

function TokenRow({ token, index }: { token: ExtendedToken; index: number }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await navigator.clipboard.writeText(token.tokenAddress);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Contract address copied to clipboard',
      });
      
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy contract address',
        variant: 'destructive',
      });
    }
  };

  const priceChange = token.priceChange24h || 0;
  const isPositive = priceChange >= 0;

  return (
    <Link href={`/token/${token.tokenAddress}`}>
      <div className="flex items-center gap-3 p-4 hover-elevate active-elevate-2 rounded-md border transition-colors cursor-pointer">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="text-sm text-muted-foreground w-8 text-center flex-shrink-0" data-testid={`text-rank-${index + 1}`}>
            {index + 1}
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0">
            {token.icon ? (
              <img 
                src={token.icon} 
                alt={token.symbol} 
                className="w-10 h-10 rounded-full bg-muted flex-shrink-0"
                data-testid={`img-token-icon-${token.tokenAddress}`}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0" data-testid={`div-token-placeholder-${token.tokenAddress}`}>
                <span className="text-xs font-bold text-muted-foreground">
                  {token.symbol.slice(0, 2)}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate" data-testid={`text-token-name-${token.tokenAddress}`}>
                {token.name}
              </h3>
              <span className="text-sm text-muted-foreground flex-shrink-0" data-testid={`text-token-symbol-${token.tokenAddress}`}>
                {token.symbol}
              </span>
            </div>
            
            <button
              onClick={handleCopyAddress}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 group"
              data-testid={`button-copy-address-${token.tokenAddress}`}
            >
              <span className="font-mono truncate max-w-[120px]">
                {token.tokenAddress.slice(0, 4)}...{token.tokenAddress.slice(-4)}
              </span>
              {copied ? (
                <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
              ) : (
                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              )}
            </button>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
          <div className="text-right min-w-[100px]">
            <div className="text-xs text-muted-foreground mb-1">Price</div>
            <div className="font-semibold text-foreground text-sm" data-testid={`text-price-${token.tokenAddress}`}>
              {token.price > 0 ? formatPrice(token.price) : 'N/A'}
            </div>
          </div>

          <div className="text-right min-w-[90px]">
            <div className="text-xs text-muted-foreground mb-1">Market Cap</div>
            <div className="font-semibold text-foreground text-sm" data-testid={`text-marketcap-${token.tokenAddress}`}>
              {token.marketCap > 0 ? formatNumber(token.marketCap) : 'N/A'}
            </div>
          </div>

          <div className="text-right min-w-[90px]">
            <div className="text-xs text-muted-foreground mb-1">24h Volume</div>
            <div className="font-semibold text-foreground text-sm" data-testid={`text-volume-${token.tokenAddress}`}>
              {token.volume24h && token.volume24h > 0 ? formatNumber(token.volume24h) : 'N/A'}
            </div>
          </div>

          {priceChange !== 0 && (
            <div className="text-right min-w-[70px]">
              <div className="text-xs text-muted-foreground mb-1">24h Change</div>
              <div 
                className={`font-semibold text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}
                data-testid={`text-change-${token.tokenAddress}`}
              >
                {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
          )}

          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="flex-shrink-0"
            data-testid={`button-view-token-${token.tokenAddress}`}
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex sm:hidden flex-col gap-2 flex-shrink-0 min-w-[100px]">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Price</div>
            <div className="font-semibold text-foreground text-sm" data-testid={`text-price-mobile-${token.tokenAddress}`}>
              {token.price > 0 ? formatPrice(token.price) : 'N/A'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">MCap</div>
            <div className="font-semibold text-foreground text-sm" data-testid={`text-marketcap-mobile-${token.tokenAddress}`}>
              {token.marketCap > 0 ? formatNumber(token.marketCap) : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Trending() {
  const { data, isLoading } = useQuery<{ tokens: ExtendedToken[] }>({
    queryKey: ['/api/tokens/trending'],
    staleTime: 60000,
    refetchInterval: 60000,
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
          Top trending Solana tokens by 24h volume. Click contract address to copy.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-20">
          <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
          <p className="text-xl text-muted-foreground">Loading trending tokens...</p>
        </div>
      ) : tokens.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <TrendingUp className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-xl text-muted-foreground">No trending tokens found</p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y" data-testid="list-trending-tokens">
            {tokens.map((token, index) => (
              <TokenRow key={token.tokenAddress} token={token} index={index} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
