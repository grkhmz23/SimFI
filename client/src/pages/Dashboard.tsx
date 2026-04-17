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
import { usePrice } from '@/lib/price-context';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatBalance, formatUSD, formatSol, formatEth, shortenAddress } from '@/lib/token-format';
import { Wallet, TrendingUp, Activity, LogIn, Sparkles, ArrowUpRight, ArrowDownRight, Zap, Circle, Flame } from 'lucide-react';
import { AchievementBadge } from '@/components/AchievementBadge';
import { ALL_BADGE_IDS } from '@/lib/achievements';
import type { User, UserAchievement } from '@shared/schema';

const updateProfileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  solanaWalletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional().or(z.literal('')),
  baseWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')),
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
  secondaryValue,
  subValue,
  trend,
  accentColor = 'primary',
  delay = 0 
}: {
  icon: any;
  label: string;
  value: string;
  secondaryValue?: string;
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
            {secondaryValue && (
              <p className="text-sm text-muted-foreground font-mono mt-0.5">≈ {secondaryValue}</p>
            )}
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

// Balance card for specific chain
function ChainBalanceCard({ 
  chain, 
  balance, 
  profit, 
  walletAddress,
  price,
  delay = 0 
}: { 
  chain: 'solana' | 'base';
  balance: bigint;
  profit: bigint;
  walletAddress?: string;
  price: number;
  delay?: number;
}) {
  const isSolana = chain === 'solana';
  const symbol = isSolana ? 'SOL' : 'ETH';
  const profitTrend = profit > 0 ? 'up' : profit < 0 ? 'down' : null;
  
  return (
    <div 
      className="opacity-0 animate-slide-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <Card className={`stats-card p-6 transition-all duration-300 hover:translate-y-[-2px] border-l-4 ${
        isSolana ? 'border-l-purple-500' : 'border-l-blue-500'
      }`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Circle className={`w-3 h-3 fill-current ${isSolana ? 'text-purple-500' : 'text-blue-500'}`} />
            <span className="font-semibold">{isSolana ? 'Solana' : 'Base'} Balance</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {walletAddress ? shortenAddress(walletAddress) : 'No wallet'}
          </span>
        </div>
        
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <AnimatedValue 
              value={formatBalance(balance, chain, 4)} 
              className="text-2xl font-bold"
              suffix={` ${symbol}`}
            />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            ≈ {formatUSD(balance, price, chain, 2)}
          </p>
          
          {/* P/L Display */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground">P/L:</span>
            <span className={`text-sm font-mono ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {profit >= 0 ? '+' : ''}{formatBalance(profit, chain, 4)} {symbol}
            </span>
            {profitTrend && (
              <span className={profitTrend === 'up' ? 'text-success' : 'text-destructive'}>
                {profitTrend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { user, setAuth, isAuthenticated, getBalance, getWalletAddress } = useAuth();
  const { solPriceUSD, ethPriceUSD } = usePrice();
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
                Login to access your dashboard, track your portfolio, and start paper trading on Base or Solana
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

  const { data: achievementsData } = useQuery<{ achievements: UserAchievement[] }>({
    queryKey: ['/api/achievements'],
    enabled: !!user,
  });

  const { data: streakData } = useQuery<{ streakCount: number; lastStreakDate: string | null; canClaim: boolean; nextBonus: number }>({
    queryKey: ['/api/streak'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const currentUser = profile || user;
  const unlockedBadges = new Set(achievementsData?.achievements.map(a => a.badgeId) || []);
  
  // Get balances for both chains
  const solanaBalance = getBalance('solana');
  const baseBalance = getBalance('base');
  const solanaProfit = currentUser?.totalProfit || 0n;
  const baseProfit = currentUser?.baseTotalProfit || 0n;
  
  // Get wallet addresses
  const solanaWallet = getWalletAddress('solana');
  const baseWallet = getWalletAddress('base');

  const form = useForm<z.infer<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      username: currentUser?.username || '',
      solanaWalletAddress: currentUser?.solanaWalletAddress || currentUser?.walletAddress || '',
      baseWalletAddress: currentUser?.baseWalletAddress || '',
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
    const updateData: any = {
      username: data.username,
    };
    if (data.solanaWalletAddress) updateData.solanaWalletAddress = data.solanaWalletAddress;
    if (data.baseWalletAddress) updateData.baseWalletAddress = data.baseWalletAddress;
    if (data.password) updateData.password = data.password;
    
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
              <span className="text-sm text-muted-foreground">Multi-Chain Trading Enabled</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-2">
              Welcome back, <span className="gradient-text">{currentUser?.username}</span>
            </h1>
            <p className="text-muted-foreground text-lg">Track your portfolio across Base and Solana</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Dual Balance Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <ChainBalanceCard
            chain="base"
            balance={baseBalance}
            profit={baseProfit}
            walletAddress={baseWallet || undefined}
            price={ethPriceUSD}
            delay={100}
          />
          <ChainBalanceCard
            chain="solana"
            balance={solanaBalance}
            profit={solanaProfit}
            walletAddress={solanaWallet || undefined}
            price={solPriceUSD}
            delay={200}
          />
        </div>

        {/* Streak Card */}
        {streakData && (
          <div className="mb-8">
            <Card className="p-6 glow-card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10 text-3xl">
                    <Flame className="h-8 w-8 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Daily Streak</p>
                    <p className="text-3xl font-bold">{streakData.streakCount} day{streakData.streakCount === 1 ? '' : 's'}</p>
                    <p className="text-xs text-muted-foreground">
                      Next bonus: +{streakData.nextBonus} ETH
                    </p>
                  </div>
                </div>
                <Button
                  disabled={!streakData.canClaim}
                  onClick={async () => {
                    const res = await fetch('/api/streak/claim', { method: 'POST', credentials: 'include' });
                    const data = await res.json();
                    if (res.ok) {
                      toast({ title: 'Bonus Claimed!', description: `+${data.bonusEth} ETH added to your Base balance.` });
                      queryClient.invalidateQueries({ queryKey: ['/api/streak'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
                    } else {
                      toast({ title: 'Claim Failed', description: data.error, variant: 'destructive' });
                    }
                  }}
                >
                  {streakData.canClaim ? 'Claim Bonus' : 'Claimed Today'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Account Status */}
        <div className="mb-8">
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

                {/* Base Wallet */}
                <FormField
                  control={form.control}
                  name="baseWalletAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Circle className="w-2 h-2 fill-current text-blue-500" />
                        Base Wallet Address
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm bg-background/50 border-border focus:border-primary transition-colors input-glow"
                          data-testid="input-base-wallet"
                          placeholder="0x..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        For Base trading and rewards (must be a valid Base/EVM address)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Solana Wallet */}
                <FormField
                  control={form.control}
                  name="solanaWalletAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Circle className="w-2 h-2 fill-current text-purple-500" />
                        Solana Wallet Address
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm bg-background/50 border-border focus:border-primary transition-colors input-glow"
                          data-testid="input-solana-wallet"
                          placeholder="7xKXtg2CW87d97TXJSDpbD5jBkhe..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        For Solana trading and rewards (must be a valid Solana address)
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

        {/* Achievements */}
        <div className="opacity-0 animate-slide-up mt-8" style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}>
          <Card className="glow-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <TrendingUp className="h-5 w-5 text-yellow-500" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Achievement Badges</h2>
            </div>
            <div className="flex flex-wrap gap-6">
              {ALL_BADGE_IDS.map((badgeId) => (
                <AchievementBadge
                  key={badgeId}
                  badgeId={badgeId}
                  unlocked={unlockedBadges.has(badgeId)}
                  size="md"
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
