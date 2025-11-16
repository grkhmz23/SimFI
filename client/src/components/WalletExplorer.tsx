// client/src/components/WalletExplorer.tsx
// Wallet Explorer Component - View any wallet's complete portfolio

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Wallet, Image, Copy, Check, ExternalLink } from 'lucide-react';

export default function WalletExplorer() {
  const [address, setAddress] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['wallet-portfolio', searchAddress],
    queryFn: async () => {
      if (!searchAddress) return null;
      const res = await fetch(`/api/study/wallet/${searchAddress}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || errorData.error || 'Failed to fetch wallet data');
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

  const formatBalance = (balance: number) => {
    if (balance >= 1_000_000) return `${(balance / 1_000_000).toFixed(2)}M`;
    if (balance >= 1_000) return `${(balance / 1_000).toFixed(2)}K`;
    return balance.toFixed(4);
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Enter wallet address (e.g., 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading}>
          <Search className="w-4 h-4 mr-2" />
          Explore
        </Button>
      </form>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.message || 'Failed to fetch wallet data. Please check the address and try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {/* Results */}
      {data && !isLoading && (
        <div className="space-y-6">
          {/* Wallet Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Wallet Portfolio
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs">
                        {searchAddress.slice(0, 12)}...{searchAddress.slice(-12)}
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
                        href={`https://solscan.io/account/${searchAddress}`}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">SOL Balance</p>
                  <p className="text-2xl font-bold">
                    {data.solBalance?.sol?.toFixed(4) || '0'} SOL
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Token Holdings</p>
                  <p className="text-2xl font-bold">
                    {data.tokens?.length || 0} tokens
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">NFT Collection</p>
                  <p className="text-2xl font-bold">
                    {data.nfts?.length || 0} NFTs
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for Tokens and NFTs */}
          <Tabs defaultValue="tokens" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="tokens" className="flex-1">
                Tokens ({data.tokens?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="nfts" className="flex-1">
                NFTs ({data.nfts?.length || 0})
              </TabsTrigger>
            </TabsList>

            {/* Tokens Tab */}
            <TabsContent value="tokens" className="mt-4">
              {data.tokens && data.tokens.length > 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {data.tokens.map((token: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {token.logo && (
                                <img
                                  src={token.logo}
                                  alt={token.symbol}
                                  className="w-10 h-10 rounded-full"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                              <div>
                                <div className="font-semibold flex items-center gap-2">
                                  {token.name || 'Unknown Token'}
                                  {token.symbol && (
                                    <Badge variant="secondary" className="text-xs">
                                      {token.symbol}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {token.mint?.slice(0, 8)}...{token.mint?.slice(-8)}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">
                                {formatBalance(token.amount || 0)}
                              </div>
                              {token.price && (
                                <div className="text-xs text-muted-foreground">
                                  ${(token.amount * token.price).toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No tokens found in this wallet
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* NFTs Tab */}
            <TabsContent value="nfts" className="mt-4">
              {data.nfts && data.nfts.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {data.nfts.map((nft: any, idx: number) => (
                    <Card key={idx} className="overflow-hidden">
                      <div className="aspect-square bg-muted relative group">
                        {nft.content?.links?.image ? (
                          <>
                            <img
                              src={nft.content.links.image}
                              alt={nft.content?.metadata?.name || 'NFT'}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <a
                                href={`https://solscan.io/token/${nft.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white hover:text-primary"
                              >
                                <ExternalLink className="w-6 h-6" />
                              </a>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Image className="w-12 h-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-3">
                        <p className="text-sm font-medium truncate">
                          {nft.content?.metadata?.name || 'Unknown NFT'}
                        </p>
                        {nft.grouping?.[0]?.group_value && (
                          <p className="text-xs text-muted-foreground truncate">
                            {nft.grouping[0].group_value.slice(0, 8)}...
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No NFTs found in this wallet
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
