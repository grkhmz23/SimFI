import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Token, Position } from '@shared/schema';
import { TrendingUp, TrendingDown, LogIn, Loader2, RefreshCw } from 'lucide-react';
import { formatSol, toBigInt, formatTokenAmount, lamportsToTokens, formatUSD, lamportsToUSD } from '@/lib/lamports';

interface TradeModalProps {
  token?: Token;
  position?: Position & { currentPrice?: number | string | bigint };
  mode?: 'buy' | 'sell';
  onClose: () => void;
}

// ✅ NEW: Server quote response type
interface ServerQuote {
  quoteId: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  priceLamports: string;
  estimatedOutput: string;
  expiresAt: number;
  expiresInMs: number;
  priceImpactBps: number;
}

const buySchema = z.object({
  solAmount: z.number().positive('Amount must be positive'),
});

const sellSchema = z.object({
  percentage: z.number().min(1).max(100),
});

export function TradeModal({ token, position, mode, onClose }: TradeModalProps) {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isBuying = mode === 'buy' || !position;
  const [lastQuoteUpdate, setLastQuoteUpdate] = useState<Date>(new Date());

  // ALWAYS fetch fresh token data on mount to ensure consistent pricing
  const tokenAddress = position?.tokenAddress || token?.tokenAddress || '';
  const { data: freshToken, isLoading: isFetchingFreshToken } = useQuery<Token>({
    queryKey: [`/api/market/token/${tokenAddress}`],
    enabled: !!tokenAddress,
    staleTime: 0,
    refetchInterval: 2500,
    refetchOnMount: 'always',
    select: (data: any) => data, // API returns token data directly now
  });

  // ALWAYS prioritize fresh data over stale position/token data
  const activeToken = freshToken || token || (position ? {
    tokenAddress: position.tokenAddress,
    name: position.tokenName,
    symbol: position.tokenSymbol,
    price: position.currentPrice || 0,
    priceUsd: undefined,
    decimals: position.decimals || 6,
  } as Partial<Token> : undefined);

  const currentPrice = toBigInt((activeToken as any)?.priceLamports || activeToken?.price || 0);
  const currentPriceUsd = activeToken?.priceUsd;
  const symbol = position?.tokenSymbol || activeToken?.symbol || '';
  const name = position?.tokenName || activeToken?.name || '';

  if (!isAuthenticated) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-login-required" aria-describedby="login-required-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <LogIn className="h-6 w-6 text-primary" />
              Login Required
            </DialogTitle>
            <DialogDescription id="login-required-description">
              You need to be logged in to trade tokens
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="rounded-lg bg-card p-6 text-center border border-card-border">
              <TrendingUp className="h-12 w-12 mx-auto text-primary mb-4" />
              <p className="text-lg font-semibold mb-2">{symbol}</p>
              <p className="text-sm text-muted-foreground mb-4">{name}</p>
              <p className="text-2xl font-bold font-mono text-primary">
                {formatSol(currentPrice, 8)} SOL
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="default"
                className="flex-1"
                onClick={() => setLocation('/login')}
                data-testid="button-goto-login"
              >
                Login
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setLocation('/register')}
                data-testid="button-goto-register"
              >
                Register
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Create an account to start paper trading with 10 SOL
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const buyForm = useForm<z.infer<typeof buySchema>>({
    resolver: zodResolver(buySchema),
    defaultValues: {
      solAmount: 0,
    },
  });

  const sellForm = useForm<z.infer<typeof sellSchema>>({
    resolver: zodResolver(sellSchema),
    defaultValues: {
      percentage: 100,
    },
  });

  const solAmount = buyForm.watch('solAmount') || 0;
  const percentage = sellForm.watch('percentage') || 100;
  const buyTokenDecimals = activeToken?.decimals || 6;

  // Calculate sell amount for display
  const positionDecimals = position?.decimals || 6;
  const sellAmountBigInt = !isBuying && position 
    ? (toBigInt(position.amount) * BigInt(percentage)) / BigInt(100)
    : BigInt(0);
  const sellTokenAmountStr = sellAmountBigInt > 0n ? lamportsToTokens(sellAmountBigInt, positionDecimals) : '0';

  // Use market data for display estimates
  const currentPriceNumber = Number(currentPrice);
  const estimatedTokens = isBuying 
    ? (currentPriceNumber > 0 && isFinite(currentPriceNumber) ? (solAmount * 1_000_000_000) / currentPriceNumber : 0)
    : 0;

  const priceImpact = 0; // Will be shown from quote response

  // Calculate sell value with BigInt arithmetic for display
  const tokenDecimals = position?.decimals || activeToken?.decimals || 6;
  const sellValueBigInt = !isBuying 
    ? (sellAmountBigInt * currentPrice) / (BigInt(10) ** BigInt(tokenDecimals))
    : BigInt(0);

  const proportionalCostBigInt = !isBuying && position 
    ? (toBigInt(position.solSpent) * BigInt(percentage)) / BigInt(100)
    : BigInt(0);

  const profitLossBigInt = !isBuying ? sellValueBigInt - proportionalCostBigInt : BigInt(0);

  // ✅ NEW: Trade mutation using server-authoritative quotes
  const tradeMutation = useMutation({
    mutationFn: async (data: { 
      side: 'buy' | 'sell'; 
      tokenAddress: string;
      amountSol?: string;
      amountTokens?: string;
      positionId?: string;
      tokenName?: string;
      tokenSymbol?: string;
    }) => {
      // Step 1: Get server-authoritative quote
      const quoteParams = new URLSearchParams({
        token: data.tokenAddress,
        side: data.side,
      });

      if (data.side === 'buy' && data.amountSol) {
        quoteParams.set('amountSol', data.amountSol);
      } else if (data.side === 'sell' && data.amountTokens) {
        quoteParams.set('amountTokens', data.amountTokens);
      }

      console.log(`🔄 Getting ${data.side} quote from server...`);
      const quoteResponse = await fetch(`/api/quote?${quoteParams}`, {
        credentials: 'include',
      });

      if (!quoteResponse.ok) {
        const err = await quoteResponse.json();
        throw new Error(err.error || 'Failed to get quote');
      }

      const quote: ServerQuote = await quoteResponse.json();
      console.log('✅ Got server quote:', quote);

      // Step 2: Execute trade with quoteId (server validates price)
      if (data.side === 'buy') {
        return apiRequest('POST', '/api/trades/buy', {
          quoteId: quote.quoteId,
          tokenName: data.tokenName,
          tokenSymbol: data.tokenSymbol,
        });
      } else {
        return apiRequest('POST', '/api/trades/sell', {
          quoteId: quote.quoteId,
          positionId: data.positionId,
        });
      }
    },
    onSuccess: async (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/positions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/history'] });

      await refreshUser();

      const decimals = (token?.decimals || position?.decimals || 6);
      toast({
        title: isBuying ? 'Position Opened!' : 'Position Closed!',
        description: isBuying 
          ? `Bought ${formatTokenAmount(toBigInt(response.tokensReceived || 0), 2, decimals)} ${symbol} for ${solAmount} SOL`
          : `Sold ${formatTokenAmount(sellAmountBigInt, 2, decimals)} ${symbol}`,
      });

      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Trade Failed',
        description: error.message || 'Transaction failed',
        variant: 'destructive',
      });
    },
  });

  const onBuySubmit = buyForm.handleSubmit((data) => {
    if (!activeToken || !tokenAddress) {
      console.error('Buy blocked: missing activeToken or tokenAddress');
      return;
    }

    const solSpentBigInt = BigInt(Math.floor(data.solAmount * 1_000_000_000));
    const userBalanceBigInt = toBigInt(user?.balance || 0);
    if (solSpentBigInt > userBalanceBigInt) {
      toast({
        title: 'Insufficient Balance',
        description: `You need ${data.solAmount} SOL but only have ${formatSol(user?.balance || 0)} SOL`,
        variant: 'destructive',
      });
      return;
    }

    // ✅ NEW: Use quote-based trade (no price from client!)
    console.log('🛒 BUY TRANSACTION STARTING (quote-based)');
    tradeMutation.mutate({
      side: 'buy',
      tokenAddress: tokenAddress,
      amountSol: data.solAmount.toString(),
      tokenName: activeToken.name || name,
      tokenSymbol: activeToken.symbol || symbol,
    });
  });

  const onSellSubmit = sellForm.handleSubmit((data) => {
    if (!position) return;

    // Calculate sell amount in token units
    const sellAmountLamports = (toBigInt(position.amount) * BigInt(data.percentage)) / BigInt(100);

    // ✅ NEW: Use quote-based trade (no price from client!)
    console.log('💰 SELL TRANSACTION STARTING (quote-based)');
    tradeMutation.mutate({
      side: 'sell',
      tokenAddress: position.tokenAddress,
      amountTokens: sellAmountLamports.toString(),
      positionId: position.id,
    });
  });

  const setSolAmount = (amount: number) => {
    buyForm.setValue('solAmount', amount);
  };

  const setPercentage = (pct: number) => {
    sellForm.setValue('percentage', pct);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-trade" aria-describedby="trade-modal-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            {isBuying ? (
              <><TrendingUp className="h-6 w-6 text-success" /> Buy {symbol}</>
            ) : (
              <><TrendingDown className="h-6 w-6 text-destructive" /> Sell {symbol}</>
            )}
          </DialogTitle>
          <DialogDescription id="trade-modal-description" className="sr-only">
            {isBuying ? `Buy ${symbol} tokens with SOL` : `Sell ${symbol} tokens for SOL`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-lg bg-card p-4 text-center border border-card-border">
            <p className="text-sm text-muted-foreground mb-2 flex items-center justify-center gap-1">
              Current Price
              {isFetchingFreshToken && (
                <RefreshCw className="h-3 w-3 text-primary animate-pulse" />
              )}
            </p>
            {isFetchingFreshToken && !activeToken ? (
              <p className="text-xl font-mono text-muted-foreground" data-testid="text-current-price">
                Loading...
              </p>
            ) : (
              <p className="text-3xl font-bold font-mono text-primary" data-testid="text-current-price">
                {currentPriceUsd !== undefined 
                  ? (currentPriceUsd < 0.01 && currentPriceUsd > 0 
                      ? `$${currentPriceUsd.toFixed(6)}` 
                      : `$${currentPriceUsd.toFixed(4)}`)
                  : formatUSD(currentPrice, 6)
                }
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Server-authoritative pricing</p>
          </div>

          {isBuying ? (
            <Form {...buyForm}>
              <form onSubmit={onBuySubmit} className="space-y-4">
                <FormField
                  control={buyForm.control}
                  name="solAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount to Spend (SOL)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.0"
                          className="font-mono"
                          disabled={tradeMutation.isPending}
                          data-testid="input-sol-amount"
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Quick Amount</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[0.1, 0.5, 1, 2, 5].map((amt) => (
                      <Button
                        key={amt}
                        type="button"
                        variant={solAmount === amt ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSolAmount(amt)}
                        disabled={tradeMutation.isPending}
                        data-testid={`button-quick-${amt}`}
                      >
                        {amt}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg bg-muted p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Est. Tokens:</span>
                    <span className="font-mono font-semibold" data-testid="text-estimated-tokens">
                      {estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    Final amount determined at execution
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Your Balance:</span>
                    <span className="font-mono">{formatSol(user?.balance || 0)} SOL</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    variant="default"
                    disabled={tradeMutation.isPending || solAmount <= 0}
                    data-testid="button-buy"
                  >
                    {tradeMutation.isPending ? 'Processing...' : 'Buy Now'}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Trade executes at server-determined price
                  </p>
                </div>
              </form>
            </Form>
          ) : (
            <Form {...sellForm}>
              <form onSubmit={onSellSubmit} className="space-y-4">
                <FormField
                  control={sellForm.control}
                  name="percentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sell Percentage</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          max="100"
                          placeholder="100"
                          className="font-mono"
                          disabled={tradeMutation.isPending}
                          data-testid="input-percentage"
                          {...field}
                          onChange={e => field.onChange(parseInt(e.target.value) || 100)}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Quick Percentage</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75, 100].map((pct) => (
                      <Button
                        key={pct}
                        type="button"
                        variant={percentage === pct ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPercentage(pct)}
                        disabled={tradeMutation.isPending}
                        data-testid={`button-quick-${pct}`}
                      >
                        {pct}%
                      </Button>
                    ))}
                  </div>
                </div>

                {position && (
                  <div className="rounded-lg bg-muted p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your Position:</span>
                      <span className="font-mono">
                        {formatTokenAmount(position.amount, 2, positionDecimals)} {symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Selling:</span>
                      <span className="font-mono font-semibold">
                        {formatTokenAmount(sellAmountBigInt, 2, positionDecimals)} {symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Est. SOL Received:</span>
                      <span className="font-mono font-semibold" data-testid="text-sell-value">
                        {formatSol(sellValueBigInt)} SOL
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground">Est. Profit/Loss:</span>
                      <span 
                        className={`font-mono font-bold ${profitLossBigInt >= 0n ? 'text-success' : 'text-destructive'}`}
                        data-testid="text-profit-loss"
                      >
                        {profitLossBigInt >= 0n ? '+' : ''}{formatSol(profitLossBigInt)} SOL
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      Final amounts determined at execution
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  variant="destructive"
                  disabled={tradeMutation.isPending || percentage <= 0}
                  data-testid="button-sell"
                >
                  {tradeMutation.isPending ? 'Processing...' : `Sell ${percentage}%`}
                </Button>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}