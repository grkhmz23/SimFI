import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatSol } from '@/lib/lamports';
import { Wallet, TrendingUp, Activity, LogIn } from 'lucide-react';
import type { User } from '@shared/schema';

const updateProfileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  password: z.string().min(6).optional().or(z.literal('')),
});

export default function Dashboard() {
  const { user, setAuth, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="min-h-[60vh] flex items-center justify-center">
          <Card className="p-12 text-center max-w-md">
            <LogIn className="h-16 w-16 mx-auto text-primary mb-6" />
            <h2 className="text-3xl font-bold mb-4">Login Required</h2>
            <p className="text-muted-foreground mb-8">
              You need to be logged in to view your dashboard and manage your account
            </p>
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
          </Card>
        </div>
      </div>
    );
  }

  const { data: profile } = useQuery<Omit<User, 'password'>>({
    queryKey: ['/api/auth/profile'],
    enabled: !!user,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const currentUser = profile || user;

  const form = useForm<z.infer<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      username: currentUser?.username || '',
      walletAddress: currentUser?.walletAddress || '',
      password: '',
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/auth/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been successfully updated',
      });
      form.setValue('password', '');
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Could not update profile',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    const updateData = {
      username: data.username,
      walletAddress: data.walletAddress,
      ...(data.password && { password: data.password }),
    };
    updateMutation.mutate(updateData);
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Manage your account and view your stats</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-primary/10 p-3">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-2xl font-bold font-mono text-foreground" data-testid="text-balance">
                {formatSol(currentUser?.balance || 0)} SOL
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-success/10 p-3">
              <TrendingUp className={`h-6 w-6 ${(currentUser?.totalProfit || 0) >= 0 ? 'text-success' : 'text-destructive'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total P/L</p>
              <p 
                className={`text-2xl font-bold font-mono ${(currentUser?.totalProfit || 0) >= 0 ? 'text-success' : 'text-destructive'}`}
                data-testid="text-total-profit"
              >
                {(currentUser?.totalProfit || 0) >= 0 ? '+' : ''}{formatSol(currentUser?.totalProfit || 0)} SOL
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-chart-2/10 p-3">
              <Activity className="h-6 w-6 text-chart-2" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Account Status</p>
              <p className="text-2xl font-bold text-foreground">Active</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-2xl font-bold text-foreground mb-6">Update Profile</h2>
        
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input data-testid="input-username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="walletAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Solana Wallet Address</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono text-sm"
                      data-testid="input-wallet"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    For leaderboard rewards (must be a valid Solana address)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Leave blank to keep current password"
                      data-testid="input-password"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Minimum 6 characters
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="button-update"
            >
              {updateMutation.isPending ? 'Updating...' : 'Update Profile'}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
