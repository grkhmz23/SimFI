import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';
import { formatUSD } from '@/lib/lamports';
import type { Token } from '@shared/schema';

interface TokenCardProps {
  token: Token;
}

export function TokenCard({ token }: TokenCardProps) {
  const [, setLocation] = useLocation();

  const formatMarketCap = (mc: number) => {
    if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`;
    if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
    return `$${mc.toFixed(0)}`;
  };

  const handleCardClick = () => {
    // Navigate to token detail page and pass token data in state
    setLocation(`/token/${token.tokenAddress}`, { state: { token } });
  };

  return (
    <>
      <Card
        className="p-6 hover-elevate active-elevate-2 cursor-pointer transition-all"
        onClick={handleCardClick}
        data-testid={`card-token-${token.tokenAddress}`}
      >
        <div className="flex items-start gap-3 mb-4">
          {token.icon && (
            <img 
              src={token.icon} 
              alt={token.symbol}
              className="w-12 h-12 rounded-full shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-foreground truncate" data-testid="text-token-symbol">
              {token.symbol}
            </h3>
            <p className="text-sm text-muted-foreground truncate">{token.name}</p>
          </div>
          <Badge variant="outline" className="ml-2 shrink-0">
            <TrendingUp className="h-3 w-3 mr-1" />
            New
          </Badge>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Price</p>
            <p className="text-2xl font-bold font-mono text-primary" data-testid="text-price">
              {formatUSD(token.price, 6)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Market Cap</p>
              <p className="text-sm font-semibold text-foreground" data-testid="text-marketcap">
                {formatMarketCap(token.marketCap)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Creator</p>
              <p className="text-xs font-mono text-foreground">
                {token.creator ? `${token.creator.slice(0, 4)}...${token.creator.slice(-4)}` : 'N/A'}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <p className="text-xs font-mono text-center text-muted-foreground">
              {token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-6)}
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
