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

interface JupiterQuote {
  solAmount: number;
  solAmountLamports: number;
  tokenAmountOut: number;
  tokenAmountDisplay: number;
  effectivePriceLamports: number;
  priceImpactPct: number;
  slippageBps: number;
}

interface JupiterSellQuote {
  tokenAmount: number;
  tokenAmountUnits: number;
  solAmountOut: number;
  solAmountDisplay: number;
  effectivePriceLamports: number;
  priceImpactPct: number;
  slippageBps: number;
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
  // This prevents showing stale prices when switching between buy/sell modes
  const tokenAddress = position?.tokenAddress || token?.tokenAddress || '';
  const { data: freshToken, isLoading: isFetchingFreshToken } = useQuery<Token>({
    queryKey: [`/api/tokens/${tokenAddress}`],
    enabled: !!tokenAddress, // Always fetch when we have an address
    staleTime: 0, // Never use cache
    refetchInterval: 2500, // Auto-refresh every 2.5 seconds
    refetchOnMount: 'always', // Force refetch on modal open
    select: (data: any) => data.token, // Unwrap { token: {...} } response
  });

  // ALWAYS prioritize fresh data over stale position/token data
  // If we have a position but no fresh token yet, use position's currentPrice as fallback
  const activeToken = freshToken || token || (position ? {
    tokenAddress: position.tokenAddress,
    name: position.tokenName,
    symbol: position.tokenSymbol,
    price: position.currentPrice || 0,
    priceUsd: undefined,
    decimals: position.decimals || 6,
  } as Partial<Token> : undefined);
  
  const currentPrice = toBigInt(activeToken?.price || 0);
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
  
  // Fetch Jupiter quote for buying
  const buyQuoteUrl = tokenAddress && solAmount > 0 
    ? `/api/tokens/quote/buy?tokenAddress=${tokenAddress}&solAmount=${solAmount}` 
    : null;
  
  const { data: jupiterQuote, isLoading: quoteLoading, dataUpdatedAt } = useQuery<JupiterQuote>({
    queryKey: [buyQuoteUrl],
    enabled: isBuying && !!buyQuoteUrl,
    refetchOnWindowFocus: false,
    refetchInterval: 2500, // Auto-refresh every 2.5 seconds
    staleTime: 0, // Always fetch fresh data
    placeholderData: (previousData) => previousData, // Keep previous data while refetching for smooth UI
  });

  // Fetch Jupiter quote for selling (keep BigInt throughout)
  const sellTokenAddress = position?.tokenAddress || '';
  const sellAmountBigInt = !isBuying && position 
    ? (toBigInt(position.amount) * BigInt(percentage)) / BigInt(100)
    : BigInt(0);
  // Use lamportsToTokens with correct decimals for precision-safe conversion to decimal string
  const positionDecimals = position?.decimals || 6;
  const sellTokenAmountStr = sellAmountBigInt > 0n ? lamportsToTokens(sellAmountBigInt, positionDecimals) : '0';
  const sellQuoteUrl = sellTokenAddress && sellTokenAmountStr !== '0'
    ? `/api/tokens/quote/sell?tokenAddress=${sellTokenAddress}&tokenAmount=${sellTokenAmountStr}`
    : null;

  const { data: jupiterSellQuote, isLoading: sellQuoteLoading } = useQuery<JupiterSellQuote>({
    queryKey: [sellQuoteUrl],
    enabled: !isBuying && !!sellQuoteUrl,
    refetchOnWindowFocus: false,
    refetchInterval: 2500, // Auto-refresh every 2.5 seconds
    staleTime: 0, // Always fetch fresh data
    placeholderData: (previousData) => previousData, // Keep previous data while refetching for smooth UI
  });

  // Update last quote timestamp when Jupiter quotes change (but don't override price)
  useEffect(() => {
    if (jupiterQuote) {
      setLastQuoteUpdate(new Date());
    }
  }, [jupiterQuote]);

  useEffect(() => {
    if (jupiterSellQuote) {
      setLastQuoteUpdate(new Date());
    }
  }, [jupiterSellQuote]);

  // Use Jupiter quote for estimated tokens if available, fallback to calculation with correct decimals
  const buyTokenDecimals = activeToken?.decimals || 6;
  const currentPriceNumber = Number(currentPrice);
  const estimatedTokens = isBuying 
    ? (jupiterQuote?.tokenAmountDisplay || ((solAmount * 1_000_000_000) * (10 ** buyTokenDecimals)) / currentPriceNumber / (10 ** buyTokenDecimals))
    : 0;
  
  const priceImpact = isBuying 
    ? (jupiterQuote?.priceImpactPct || 0)
    : (jupiterSellQuote?.priceImpactPct || 0);
  
  // Use BigInt for all calculations, convert to Number only for display
  const proportionalCostBigInt = !isBuying && position 
    ? (toBigInt(position.solSpent) * BigInt(percentage)) / BigInt(100)
    : BigInt(0);
  
  // Calculate sell value with BigInt arithmetic
  // currentPrice is in lamports per 1.0 whole token (not per token lamport)
  // Formula: (tokenLamports * priceLamportsPerToken) / 10^decimals = SOL lamports
  // CRITICAL: Use token's decimals (6 for pump.fun), not SOL decimals (9)!
  const tokenDecimals = position?.decimals || activeToken?.decimals || 6;
  const sellValueBigInt = !isBuying 
    ? (sellAmountBigInt * currentPrice) / (BigInt(10) ** BigInt(tokenDecimals))
    : BigInt(0);
  
  const profitLossBigInt = !isBuying ? sellValueBigInt - proportionalCostBigInt : BigInt(0);

  const tradeMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isBuying) {
        return apiRequest('POST', '/api/trades/buy', data);
      } else {
        return apiRequest('POST', '/api/trades/sell', data);
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
    
    const priceNumber = Number(currentPrice);
    console.log('Buy submit - currentPrice:', currentPrice.toString(), 'priceNumber:', priceNumber);
    console.log('Buy submit - activeToken:', activeToken);
    
    if (priceNumber <= 0) {
      toast({
        title: 'Price Unavailable',
        description: 'Token price is loading, please wait a moment and try again',
        variant: 'destructive',
      });
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
    
    // Use currentPrice from DexScreener for consistent pricing across the app
    const tradeData = {
      tokenAddress: tokenAddress,
      tokenName: activeToken.name || name,
      tokenSymbol: activeToken.symbol || symbol,
      solAmount: data.solAmount,
      price: priceNumber, // Convert BigInt to number for API
      decimals: activeToken.decimals || 6, // Default to 6 for pump.fun tokens
    };
    
    console.log('Submitting buy trade:', tradeData);
    tradeMutation.mutate(tradeData);
  });

  const onSellSubmit = sellForm.handleSubmit((data) => {
    if (!position) return;
    
    // Keep BigInt throughout - send lamports as string to backend
    const sellAmountLamports = (toBigInt(position.amount) * BigInt(data.percentage)) / BigInt(100);
    
    // currentPrice is already a BigInt in lamports per whole token from DexScreener
    const exitPriceLamports = currentPrice;
    
    tradeMutation.mutate({
      positionId: position.id,
      amountLamports: sellAmountLamports.toString(),
      exitPriceLamports: exitPriceLamports.toString(),
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
              {(isFetchingFreshToken || (isBuying ? jupiterQuote : jupiterSellQuote)) && (
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
            {!isFetchingFreshToken && (isBuying ? jupiterQuote : jupiterSellQuote) && (
              <p className="text-xs text-muted-foreground mt-1">Live • Auto-updating</p>
            )}
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
                    <span className="text-muted-foreground flex items-center gap-1">
                      Est. Tokens:
                      {jupiterQuote && solAmount > 0 && (
                        <RefreshCw className="h-3 w-3 text-primary animate-pulse" />
                      )}
                    </span>
                    <span className="font-mono font-semibold flex items-center gap-2" data-testid="text-estimated-tokens">
                      {quoteLoading && solAmount > 0 ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Loading...</>
                      ) : (
                        `${estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`
                      )}
                    </span>
                  </div>
                  {jupiterQuote && solAmount > 0 && (
                    <div className="text-xs text-muted-foreground text-right">
                      Live quote • Auto-updating
                    </div>
                  )}
                  {jupiterQuote && priceImpact !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price Impact:</span>
                      <span className={`font-mono text-xs ${Math.abs(priceImpact) > 5 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {priceImpact > 0 ? '+' : ''}{priceImpact.toFixed(2)}%
                      </span>
                    </div>
                  )}
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
                  {jupiterQuote && solAmount > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Trade executes at the current live quote price
                    </p>
                  )}
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
                      <span className="font-mono font-semibold flex items-center gap-2" data-testid="text-sell-value">
                        {sellQuoteLoading && sellAmountBigInt > 0n ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Loading...</>
                        ) : (
                          `${formatSol(sellValueBigInt)} SOL`
                        )}
                      </span>
                    </div>
                    {jupiterSellQuote && priceImpact !== 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Price Impact:</span>
                        <span className={`font-mono text-xs ${Math.abs(priceImpact) > 5 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {priceImpact > 0 ? '+' : ''}{priceImpact.toFixed(2)}%
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground">Profit/Loss:</span>
                      <span 
                        className={`font-mono font-bold ${profitLossBigInt >= 0n ? 'text-success' : 'text-destructive'}`}
                        data-testid="text-profit-loss"
                      >
                        {profitLossBigInt >= 0n ? '+' : ''}{formatSol(profitLossBigInt)} SOL
                      </span>
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
