import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Droplets, Clock } from 'lucide-react';
import { formatCompactNumber, formatPercentage } from '@/lib/token-format';
import { useLocation } from 'wouter';

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

interface TrendingTokenCardProps {
  token: TrendingToken;
  showAge?: boolean;
  rank?: number;
}

export function TrendingTokenCard({ token, showAge = false, rank }: TrendingTokenCardProps) {
  const [, setLocation] = useLocation();

  const priceChange = token.priceChange24h || 0;
  const isPositive = priceChange >= 0;

  const getAgeText = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    const minutes = Math.floor((Date.now() - timestamp) / (1000 * 60));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card
      className="p-4 hover:border-primary/50 transition-all cursor-pointer group bg-card/90 backdrop-blur"
      onClick={() => setLocation(`/token/${token.tokenAddress}`)}
    >
      <div className="flex items-center gap-3">
        {rank && (
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
            {rank}
          </div>
        )}
        {token.icon ? (
          <img
            src={token.icon}
            alt={token.symbol}
            className="w-10 h-10 rounded-full ring-2 ring-border"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
            {token.symbol.slice(0, 2)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{token.name}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {token.symbol}
            </Badge>
          </div>
          <p className="text-xs font-mono text-muted-foreground truncate">
            {token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}
          </p>

          <div className="flex items-center gap-3 mt-1.5 text-xs">
            {token.liquidity > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Droplets className="h-3 w-3" />
                {formatCompactNumber(token.liquidity)}
              </span>
            )}
            {showAge && token.pairCreatedAt && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {getAgeText(token.pairCreatedAt)}
              </span>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div
            className={`flex items-center justify-end gap-1 text-sm font-semibold ${
              isPositive ? 'text-success' : 'text-destructive'
            }`}
          >
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatPercentage(priceChange)}
          </div>
          {token.marketCap > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              MC: {formatCompactNumber(token.marketCap)}
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-7 text-xs px-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Trade
          </Button>
        </div>
      </div>
    </Card>
  );
}
