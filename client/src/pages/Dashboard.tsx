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
import { Wallet, TrendingUp, Activity, LogIn, Sparkles, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import type { User } from '@shared/schema';

const updateProfileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  password: z.string().min(6).optional().or(z.literal('')),
});

// Animated number component
function AnimatedValue({ value, prefix = '', suffix = '', className = '' }: { 
  value: string | number; 
  prefix?: string; 
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums transition-all duration-300 ${className}`}>
      {prefix}{value}{suffix}
    </span>
  );
}

// Stats card component
function StatsCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue,
  trend,
  accentColor = 'primary',
  delay = 0 
}: {
  icon: any;
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | null;
  accentColor?: 'primary' | 'success' | 'destructive' | 'accent';
  delay?: number;
}) {
  const colorMap = {
    primary: 'from-primary/20 to-primary/5 text-primary',
    success: 'from-success/20 to-success/5 text-success',
    destructive: 'from-destructive/20 to-destructive/5 text-destructive',
    accent: 'from-accent/20 to-accent/5 text-accent',
  };

  const glowMap = {
    primary: 'group-hover:shadow-[0_0_30px_hsl(var(--primary)/0.2)]',
    success: 'group-hover:shadow-[0_0_30px_hsl(var(--success)/0.2)]',
    destructive: 'group-hover:shadow-[0_0_30px_hsl(var(--destructive)/0.2)]',
    accent: 'group-hover:shadow-[0_0_30px_hsl(var(--accent)/0.2)]',
  };

  return (
    <div 
      className={`opacity-0 animate-slide-up group`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <Card className={`stats-card p-6 transition-all duration-300 hover:translate-y-[-2px] ${glowMap[accentColor]}`}>
        {/* Gradient top border */}
        <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-${accentColor} to-transparent opacity-60`} />

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">{label}</p>
            <div className="flex items-baseline gap-2">
              <AnimatedValue 
                value={value} 
                className={`text-3xl font-bold ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-foreground'}`}
              />
              {trend && (
                <span className={`flex items-center text-sm ${trend === 'up' ? 'text-success' : 'text-destructive'}`}>
                  {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </span>
              )}
            </div>
            {subValue && (
              <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
            )}
          </div>
          <div className={`rounded-xl bg-gradient-to-br ${colorMap[accentColor]} p-3`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { user, setAuth, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="opacity-0 animate-scale-in" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
          <Card className="glass-card p-12 text-center max-w-md relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl animate-glow-pulse" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: '1.5s' }} />

            <div className="relative z-10">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <LogIn className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-3xl font-bold mb-3 gradient-text">Welcome to SimFi</h2>
              <p className="text-muted-foreground mb-8">
                Login to access your dashboard, track your portfolio, and start paper trading
              </p>
              <div className="flex gap-3">
                <Button
                  className="flex-1 btn-glow"
                  onClick={() => setLocation('/login')}
                  data-testid="button-goto-login"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Login
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 hover:border-primary/50 transition-colors"
                  onClick={() => setLocation('/register')}
                  data-testid="button-goto-register"
                >
                  Register
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const { data: profile } = useQuery<Omit<User, 'password'>>({
    queryKey: ['/api/auth/profile'],
    enabled: !!user,
    refetchInterval: 5000,
  });

  const currentUser = profile || user;
  const totalProfit = currentUser?.totalProfit || 0;
  const profitTrend = totalProfit > 0 ? 'up' : totalProfit < 0 ? 'down' : null;

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
    <div className="min-h-screen">
      {/* Hero section with gradient */}
      <div className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 mesh-gradient opacity-50" />
        <div className="absolute inset-0 grid-pattern opacity-30" />

        <div className="relative container mx-auto px-4 py-12 max-w-6xl">
          <div className="opacity-0 animate-slide-up" style={{ animationFillMode: 'forwards' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm text-muted-foreground">Live Trading Session</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-2">
              Welcome back, <span className="gradient-text">{currentUser?.username}</span>
            </h1>
            <p className="text-muted-foreground text-lg">Track your portfolio and manage your account</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatsCard
            icon={Wallet}
            label="Available Balance"
            value={`${formatSol(currentUser?.balance || 0)} SOL`}
            subValue="Ready to trade"
            accentColor="primary"
            delay={100}
          />

          <StatsCard
            icon={TrendingUp}
            label="Total P/L"
            value={`${totalProfit >= 0 ? '+' : ''}${formatSol(totalProfit)} SOL`}
            subValue="All-time performance"
            trend={profitTrend}
            accentColor={totalProfit >= 0 ? 'success' : 'destructive'}
            delay={200}
          />

          <StatsCard
            icon={Activity}
            label="Account Status"
            value="Active"
            subValue="All systems operational"
            accentColor="accent"
            delay={300}
          />
        </div>

        {/* Profile Form */}
        <div className="opacity-0 animate-slide-up" style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}>
          <Card className="glow-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Update Profile</h2>
            </div>

            <Form {...form}>
              <form onSubmit={onSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input 
                            className="bg-background/50 border-border focus:border-primary transition-colors input-glow" 
                            data-testid="input-username" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Leave blank to keep current"
                            className="bg-background/50 border-border focus:border-primary transition-colors input-glow"
                            data-testid="input-password"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Minimum 6 characters
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="walletAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Solana Wallet Address</FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm bg-background/50 border-border focus:border-primary transition-colors input-glow"
                          data-testid="input-wallet"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        For leaderboard rewards (must be a valid Solana address)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="btn-glow"
                  data-testid="button-update"
                >
                  {updateMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Update Profile
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  );
}