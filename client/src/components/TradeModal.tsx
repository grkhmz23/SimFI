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
  amount: z.number().positive('Amount must be positive'),
});

export function TradeModal({ token, position, onClose }: TradeModalProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isBuying = !position;
  const currentPrice = position?.currentPrice || token?.price || 0;
  const symbol = position?.tokenSymbol || token?.symbol || '';
  const name = position?.tokenName || token?.name || '';

  // If user is not authenticated, show login prompt
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

  const form = useForm<z.infer<typeof buySchema>>({
    resolver: zodResolver(buySchema),
    defaultValues: {
      amount: position ? position.amount / 1_000_000_000 : 0,
    },
  });

  const amount = form.watch('amount') || 0;
  const totalCost = amount * currentPrice;

  const tradeMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isBuying) {
        return apiRequest('POST', '/api/trades/buy', data);
      } else {
        return apiRequest('POST', '/api/trades/sell', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/positions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/history'] });
      
      toast({
        title: isBuying ? 'Position Opened!' : 'Position Closed!',
        description: isBuying 
          ? `Bought ${amount.toLocaleString()} ${symbol}` 
          : `Sold ${amount.toLocaleString()} ${symbol}`,
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

  const onSubmit = form.handleSubmit((data) => {
    if (isBuying) {
      if (!token) return;
      if (totalCost > (user?.balance || 0)) {
        toast({
          title: 'Insufficient Balance',
          description: `You need ${formatSol(totalCost)} SOL but only have ${formatSol(user?.balance || 0)} SOL`,
          variant: 'destructive',
        });
        return;
      }
      
      tradeMutation.mutate({
        tokenAddress: token.tokenAddress,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        amount: data.amount,
        price: currentPrice,
      });
    } else {
      if (!position) return;
      tradeMutation.mutate({
        positionId: position.id,
        exitPrice: currentPrice,
      });
    }
  });

  const profitLoss = position ? totalCost - position.solSpent : 0;

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

          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ({symbol})</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0.0"
                        className="font-mono"
                        disabled={!isBuying || tradeMutation.isPending}
                        data-testid="input-amount"
                        {...field}
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isBuying ? 'Total Cost' : 'Current Value'}:</span>
                  <span className="font-mono font-semibold" data-testid="text-total-cost">
                    {formatSol(totalCost)} SOL
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Balance:</span>
                  <span className="font-mono">{formatSol(user?.balance || 0)} SOL</span>
                </div>
                {!isBuying && (
                  <div className="flex justify-between text-sm pt-2 border-t border-border">
                    <span className="text-muted-foreground">Profit/Loss:</span>
                    <span 
                      className={`font-mono font-bold ${profitLoss >= 0 ? 'text-success' : 'text-destructive'}`}
                      data-testid="text-profit-loss"
                    >
                      {profitLoss >= 0 ? '+' : ''}{formatSol(profitLoss)} SOL
                    </span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                variant={isBuying ? 'default' : 'destructive'}
                disabled={tradeMutation.isPending || amount <= 0}
                data-testid={isBuying ? "button-buy" : "button-sell"}
              >
                {tradeMutation.isPending ? 'Processing...' : (isBuying ? 'Buy Now' : 'Sell Position')}
              </Button>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
