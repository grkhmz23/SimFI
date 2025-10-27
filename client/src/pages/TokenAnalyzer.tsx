import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ExternalLink, TrendingUp, Clock, Copy, CheckCircle2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TokenMetadata {
  name: string;
  symbol: string;
  mint: string;
  decimals: number;
  logoURI?: string;
}

interface TransactionSummary {
  signature: string;
  timestamp: number;
  type: string;
  description: string;
  fee: number;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
  }>;
}

interface TokenAnalysis {
  metadata: TokenMetadata;
  totalSupply?: number;
  holders?: number;
  recentTransactions: TransactionSummary[];
  topHolders?: Array<{
    address: string;
    balance: number;
    percentage: number;
  }>;
}

export default function TokenAnalyzer() {
  const [mintAddress, setMintAddress] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const { toast } = useToast();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const { data: analysis, isLoading, error } = useQuery<TokenAnalysis>({
    queryKey: [`/api/analyze/${searchAddress}`],
    enabled: searchAddress.length > 0,
    staleTime: 30000,
    retry: 1,
  });

  const handleAnalyze = () => {
    const trimmed = mintAddress.trim();
    if (trimmed.length < 32) {
      toast({
        title: 'Invalid Address',
        description: 'Please enter a valid Solana token address',
        variant: 'destructive',
      });
      return;
    }
    setSearchAddress(trimmed);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(text);
      toast({
        title: 'Copied!',
        description: `${label} copied to clipboard`,
      });
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const formatAddress = (address: string) => {
    if (address.length <= 16) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
              Solana Token Analyzer
            </h1>
            <p className="text-muted-foreground">
              Analyze Solana tokens using on-chain data from Helius API
            </p>
          </div>

          {/* Search */}
          <Card>
            <CardHeader>
              <CardTitle>Token Address</CardTitle>
              <CardDescription>
                Enter a Solana token mint address to analyze its on-chain activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter token mint address (e.g., EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)"
                  value={mintAddress}
                  onChange={(e) => setMintAddress(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                  className="flex-1"
                  data-testid="input-mint-address"
                />
                <Button
                  onClick={handleAnalyze}
                  disabled={isLoading || mintAddress.trim().length < 32}
                  data-testid="button-analyze"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Analyze
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error State */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="text-center text-destructive">
                  <p className="font-semibold">Analysis Failed</p>
                  <p className="text-sm mt-1">
                    {error instanceof Error ? error.message : 'Could not analyze token. Please check the address and try again.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {analysis && (
            <div className="space-y-6">
              {/* Token Info */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {analysis.metadata.logoURI && (
                        <img
                          src={analysis.metadata.logoURI}
                          alt={analysis.metadata.symbol}
                          className="w-16 h-16 rounded-full"
                        />
                      )}
                      <div>
                        <CardTitle className="text-2xl">{analysis.metadata.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" data-testid="badge-symbol">
                            {analysis.metadata.symbol}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {analysis.metadata.decimals} decimals
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Mint Address</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-muted px-3 py-1.5 rounded font-mono flex-1 overflow-x-auto">
                        {analysis.metadata.mint}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(analysis.metadata.mint, 'Address')}
                        data-testid="button-copy-mint"
                      >
                        {copiedAddress === analysis.metadata.mint ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                        data-testid="link-solscan"
                      >
                        <a
                          href={`https://solscan.io/token/${analysis.metadata.mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Top Holders */}
              {analysis.topHolders && analysis.topHolders.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      <CardTitle>Top Token Holders</CardTitle>
                    </div>
                    <CardDescription>
                      Top {analysis.topHolders.length} holders by balance
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analysis.topHolders.map((holder, index) => (
                        <div
                          key={holder.address}
                          className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50 hover-elevate"
                          data-testid={`holder-${index}`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Badge variant="secondary" className="shrink-0">
                              #{index + 1}
                            </Badge>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <code className="text-xs bg-background px-2 py-1 rounded font-mono truncate">
                                {formatAddress(holder.address)}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 shrink-0"
                                onClick={() => copyToClipboard(holder.address, 'Holder address')}
                                data-testid={`button-copy-holder-${index}`}
                              >
                                {copiedAddress === holder.address ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 shrink-0"
                                asChild
                                data-testid={`link-solscan-holder-${index}`}
                              >
                                <a
                                  href={`https://solscan.io/account/${holder.address}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-mono font-semibold">
                              {holder.percentage.toFixed(2)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {holder.balance.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Transaction History */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    <CardTitle>Recent Transactions</CardTitle>
                  </div>
                  <CardDescription>
                    Last {analysis.recentTransactions.length} transactions for this token
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.recentTransactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No recent transactions found</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analysis.recentTransactions.slice(0, 20).map((tx) => (
                        <div
                          key={tx.signature}
                          className="flex items-start justify-between gap-4 p-4 rounded-lg bg-muted/50 hover-elevate"
                          data-testid={`transaction-${tx.signature.slice(0, 8)}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {tx.type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(tx.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm mb-2">{tx.description}</p>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-background px-2 py-1 rounded font-mono">
                                {formatAddress(tx.signature)}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(tx.signature, 'Signature')}
                                data-testid={`button-copy-${tx.signature.slice(0, 8)}`}
                              >
                                {copiedAddress === tx.signature ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                asChild
                                data-testid={`link-solscan-${tx.signature.slice(0, 8)}`}
                              >
                                <a
                                  href={`https://solscan.io/tx/${tx.signature}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">Fee</p>
                            <p className="text-sm font-mono">
                              {(tx.fee / 1_000_000_000).toFixed(6)} SOL
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty State */}
          {!analysis && !isLoading && !error && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Search className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">Ready to Analyze</p>
                  <p className="text-sm">
                    Enter a Solana token mint address above to get started
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
