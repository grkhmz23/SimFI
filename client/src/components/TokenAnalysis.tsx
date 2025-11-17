// client/src/components/TokenAnalysis.tsx
// Token Analysis Component - Comprehensive token details

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ExternalLink, Copy, Check, TrendingUp, Users, DollarSign } from 'lucide-react';

export default function TokenAnalysis() {
  const [address, setAddress] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['token-analysis', searchAddress],
    queryFn: async () => {
      if (!searchAddress) return null;
      const res = await fetch(`/api/study/token/${searchAddress}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || errorData.error || 'Failed to fetch token data');
      }
      return res.json();
    },
    enabled: !!searchAddress,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      setSearchAddress(address.trim());
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatNumber = (num: number | string) => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
    return n.toFixed(2);
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Enter token mint address (e.g., EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading}>
          <Search className="w-4 h-4 mr-2" />
          Analyze
        </Button>
      </form>

      {/* Example Tokens */}
      {!searchAddress && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">Try:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
              setSearchAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
            }}
          >
            USDC
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAddress('So11111111111111111111111111111111111111112');
              setSearchAddress('So11111111111111111111111111111111111111112');
            }}
          >
            SOL
          </Button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.message || 'Failed to fetch token data. Please check the address and try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      )}

      {/* Results */}
      {data && !isLoading && (
        <div className="space-y-6">
          {/* Token Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {data.metadata?.legacyMetadata?.logoURI && (
                    <img
                      src={data.metadata.legacyMetadata.logoURI}
                      alt={data.metadata.legacyMetadata.name || data.metadata.onChainMetadata?.metadata?.data?.name}
                      className="w-16 h-16 rounded-full"
                    />
                  )}
                  <div>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      {data.metadata?.legacyMetadata?.name || data.metadata?.onChainMetadata?.metadata?.data?.name || 'Unknown Token'}
                      {(data.metadata?.legacyMetadata?.symbol || data.metadata?.onChainMetadata?.metadata?.data?.symbol) && (
                        <Badge variant="secondary">
                          {data.metadata?.legacyMetadata?.symbol || data.metadata?.onChainMetadata?.metadata?.data?.symbol}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs">
                        {searchAddress.slice(0, 8)}...{searchAddress.slice(-8)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(searchAddress)}
                        className="h-6 w-6 p-0"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                      <a
                        href={`https://solscan.io/token/${searchAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View on Solscan
                      </a>
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {data.metadata?.legacyMetadata?.extensions?.description && (
                <p className="text-sm text-muted-foreground">
                  {data.metadata.legacyMetadata.extensions.description}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Security Warnings */}
          {data.securityFlags && data.securityFlags.length > 0 && (
            <div className="space-y-2">
              {data.securityFlags.map((flag: any, idx: number) => (
                <Alert key={idx} variant={flag.type === 'warning' ? 'destructive' : 'default'}>
                  <AlertDescription>{flag.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Market Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Price */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Price</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.priceData?.price 
                    ? `$${data.priceData.price < 0.01 
                        ? data.priceData.price.toExponential(2) 
                        : data.priceData.price.toFixed(6)}`
                    : 'N/A'}
                </div>
                {data.priceData?.priceChange24h !== undefined && (
                  <p className={`text-xs mt-1 ${data.priceData.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {data.priceData.priceChange24h >= 0 ? '+' : ''}{data.priceData.priceChange24h.toFixed(2)}% (24h)
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Market Cap */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Market Cap</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.priceData?.marketCap 
                    ? `$${formatNumber(data.priceData.marketCap)}`
                    : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Fully diluted
                </p>
              </CardContent>
            </Card>

            {/* Liquidity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Liquidity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.priceData?.liquidity 
                    ? `$${formatNumber(data.priceData.liquidity)}`
                    : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total liquidity
                </p>
              </CardContent>
            </Card>

            {/* Volume */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Volume (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.priceData?.volume24h 
                    ? `$${formatNumber(data.priceData.volume24h)}`
                    : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Trading volume
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Top Holders List */}
          {data.topHolders && data.topHolders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Token Holders</CardTitle>
                <CardDescription>
                  Largest token holders by balance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.topHolders.map((holder: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">#{idx + 1}</Badge>
                        <span className="font-mono text-sm">
                          {holder.address?.slice(0, 8)}...{holder.address?.slice(-8)}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {formatNumber(holder.uiAmount || 0)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {holder.amount ? 
                            `${((holder.uiAmount / data.supply?.value?.uiAmount) * 100).toFixed(2)}%` 
                            : 'N/A'
                          }
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metadata Details */}
          {data.metadata?.onChainAccountInfo?.accountInfo?.data?.parsed?.info && (
            <Card>
              <CardHeader>
                <CardTitle>On-Chain Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Mint Authority:</span>
                    <p className="font-mono text-xs break-all">
                      {data.metadata.onChainAccountInfo.accountInfo.data.parsed.info.mintAuthority || 'None'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Freeze Authority:</span>
                    <p className="font-mono text-xs break-all">
                      {data.metadata.onChainAccountInfo.accountInfo.data.parsed.info.freezeAuthority || 'None'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
