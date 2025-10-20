import { useState } from 'react';
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
import { useMutation } from '@tanstack/react-query';
import type { Token, Position } from '@shared/schema';
import { TrendingUp, TrendingDown, LogIn } from 'lucide-react';
import { formatSol } from '@/lib/lamports';

interface TradeModalProps {
  token?: Token;
  position?: Position & { currentPrice?: number };
  onClose: () => void;
}

const buySchema = z.object({
  solAmount: z.number().positive('Amount must be positive'),
});

const sellSchema = z.object({
  percentage: z.number().min(1).max(100),
});

export function TradeModal({ token, position, onClose }: TradeModalProps) {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isBuying = !position;
  const currentPrice = position?.currentPrice || token?.price || 0;
  const symbol = position?.tokenSymbol || token?.symbol || '';
  const name = position?.tokenName || token?.name || '';

  if (!isAuthenticated) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-login-required">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <LogIn className="h-6 w-6 text-primary" />
              Login Required
            </DialogTitle>
            <DialogDescription>
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
  
  const estimatedTokens = isBuying ? Math.floor((solAmount * 1_000_000_000) / currentPrice) : 0;
  const sellAmount = !isBuying && position ? (position.amount * percentage / 100) : 0;
  const sellValue = !isBuying ? (sellAmount / 1_000_000_000) * currentPrice : 0;
  const proportionalCost = !isBuying && position ? (position.solSpent * percentage / 100) : 0;
  const profitLoss = !isBuying ? sellValue - proportionalCost : 0;

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
      
      toast({
        title: isBuying ? 'Position Opened!' : 'Position Closed!',
        description: isBuying 
          ? `Bought ${(response.tokensReceived / 1_000_000_000).toLocaleString()} ${symbol} for ${solAmount} SOL`
          : `Sold ${(sellAmount / 1_000_000_000).toLocaleString()} ${symbol}`,
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
    if (!token) return;
    const solSpent = data.solAmount * 1_000_000_000;
    if (solSpent > (user?.balance || 0)) {
      toast({
        title: 'Insufficient Balance',
        description: `You need ${data.solAmount} SOL but only have ${formatSol(user?.balance || 0)} SOL`,
        variant: 'destructive',
      });
      return;
    }
    
    tradeMutation.mutate({
      tokenAddress: token.tokenAddress,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      solAmount: data.solAmount,
      price: currentPrice,
    });
  });

  const onSellSubmit = sellForm.handleSubmit((data) => {
    if (!position) return;
    const tokensToSell = (position.amount * data.percentage) / 100 / 1_000_000_000;
    
    tradeMutation.mutate({
      positionId: position.id,
      amount: tokensToSell,
      exitPrice: currentPrice,
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
      <DialogContent className="sm:max-w-md" data-testid="dialog-trade">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            {isBuying ? (
              <><TrendingUp className="h-6 w-6 text-success" /> Buy {symbol}</>
            ) : (
              <><TrendingDown className="h-6 w-6 text-destructive" /> Sell {symbol}</>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-lg bg-card p-4 text-center border border-card-border">
            <p className="text-sm text-muted-foreground mb-2">Current Price (SOL)</p>
            <p className="text-3xl font-bold font-mono text-primary" data-testid="text-current-price">
              {formatSol(currentPrice, 8)}
            </p>
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
                      {(estimatedTokens / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Your Balance:</span>
                    <span className="font-mono">{formatSol(user?.balance || 0)} SOL</span>
                  </div>
                </div>

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
                        {(position.amount / 1_000_000_000).toLocaleString()} {symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Selling:</span>
                      <span className="font-mono font-semibold">
                        {(sellAmount / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Est. Value:</span>
                      <span className="font-mono font-semibold" data-testid="text-sell-value">
                        {formatSol(sellValue)} SOL
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground">Profit/Loss:</span>
                      <span 
                        className={`font-mono font-bold ${profitLoss >= 0 ? 'text-success' : 'text-destructive'}`}
                        data-testid="text-profit-loss"
                      >
                        {profitLoss >= 0 ? '+' : ''}{formatSol(profitLoss)} SOL
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
