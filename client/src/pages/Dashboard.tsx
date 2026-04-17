import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { DataCell } from '@/components/ui/data-cell';
import { ChainChip } from '@/components/ui/chain-chip';
import { AddressPill } from '@/components/ui/address-pill';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
import { usePrice } from '@/lib/price-context';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatBalance, formatUSD, shortenAddress } from '@/lib/token-format';
import { Wallet, TrendingUp, Activity, LogIn, Target, User as UserIcon, Loader2, Copy, Check, Award, Flame } from 'lucide-react';
import { AchievementBadge } from '@/components/AchievementBadge';
import { ALL_BADGE_IDS } from '@/lib/achievements';
import type { User as UserType, UserAchievement, Chain } from '@shared/schema';
import { cn } from '@/lib/utils';

const updateProfileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, underscores, and hyphens'),
  solanaWalletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address').optional().or(z.literal('')),
  baseWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Base address').optional().or(z.literal('')),
  password: z.string().min(6, 'Minimum 6 characters').optional().or(z.literal('')),
});

function BalanceCard({
  chain,
  balance,
  profit,
  walletAddress,
  price,
}: {
  chain: Chain;
  balance: bigint;
  profit: bigint;
  walletAddress: string | null;
  price: number;
}) {
  const isSolana = chain === 'solana';
  const symbol = isSolana ? 'SOL' : 'ETH';
  const isProfit = profit >= 0n;

  return (
    <Card className="overflow-hidden">
      <div className={cn('h-1', isSolana ? 'bg-[var(--chain-solana)]' : 'bg-[var(--chain-base)]')} />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChainChip chain={chain} />
            <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">Balance</CardTitle>
          </div>
          {walletAddress ? (
            <AddressPill address={walletAddress} />
          ) : (
            <span className="text-xs text-[var(--text-tertiary)]">No wallet</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <DataCell
            value={formatBalance(balance, chain, 4)}
            suffix={` ${symbol}`}
            className="text-2xl font-semibold"
          />
          <p className="text-sm text-[var(--text-secondary)] font-mono tabular-nums mt-0.5">
            ≈ {formatUSD(balance, price, chain, 2)}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">P/L:</span>
          <DataCell
            value={`${isProfit ? '+' : ''}${formatBalance(profit, chain, 4)} ${symbol}`}
            variant={isProfit ? 'gain' : profit < 0n ? 'loss' : 'default'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, setAuth, isAuthenticated, getBalance, getWalletAddress } = useAuth();
  const { solPriceUSD, ethPriceUSD } = usePrice();
  const [, setLocation] = useLocation();
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [streakMessage, setStreakMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 bg-[var(--bg-base)]">
        <Card className="max-w-md w-full text-center p-10">
          <div className="w-16 h-16 mx-auto mb-6 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center">
            <LogIn className="h-8 w-8 text-[var(--text-secondary)]" />
          </div>
          <h2 className="font-serif text-2xl text-[var(--text-primary)] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
            Welcome to SimFi
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8">
            Login to access your dashboard, track your portfolio, and start paper trading on Base or Solana
          </p>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => setLocation('/login')} data-testid="button-goto-login">
              <LogIn className="w-4 h-4 mr-2" />
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
    );
  }

  const { data: profile, isLoading: profileLoading } = useQuery<Omit<UserType, 'password'>>({
    queryKey: ['/api/auth/profile'],
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: achievementsData } = useQuery<{ achievements: UserAchievement[] }>({
    queryKey: ['/api/achievements'],
    enabled: !!user,
  });

  const { data: streakData } = useQuery<{
    streakCount: number;
    lastStreakDate: string | null;
    canClaim: boolean;
    nextBonus: number;
  }>({
    queryKey: ['/api/streak'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const currentUser = profile || user;
  const unlockedBadges = new Set(achievementsData?.achievements.map((a) => a.badgeId) || []);

  const solanaBalance = getBalance('solana');
  const baseBalance = getBalance('base');
  const solanaProfit = currentUser?.totalProfit || 0n;
  const baseProfit = currentUser?.baseTotalProfit || 0n;
  const solanaWallet = getWalletAddress('solana');
  const baseWallet = getWalletAddress('base');

  const referralLink = typeof window !== 'undefined'
    ? `${window.location.origin}/register?ref=${currentUser?.username}`
    : '';

  const copyReferral = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 2000);
    } catch {
      // ignore
    }
  };

  const form = useForm<z.infer<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      username: currentUser?.username || '',
      solanaWalletAddress: currentUser?.solanaWalletAddress || currentUser?.walletAddress || '',
      baseWalletAddress: currentUser?.baseWalletAddress || '',
      password: '',
    },
  });

  // Reset form when profile loads
  useEffect(() => {
    if (currentUser) {
      form.reset({
        username: currentUser.username || '',
        solanaWalletAddress: currentUser.solanaWalletAddress || currentUser.walletAddress || '',
        baseWalletAddress: currentUser.baseWalletAddress || '',
        password: '',
      });
    }
  }, [currentUser, form]);

  const updateMutation = useMutation({
    mutationFn: (data: { username: string; solanaWalletAddress?: string; baseWalletAddress?: string; password?: string }) =>
      apiRequest('PUT', '/api/auth/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      setProfileError(null);
      form.setValue('password', '');
    },
    onError: (error: Error) => {
      setProfileError(error.message || 'Could not update profile');
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    const updateData: { username: string; solanaWalletAddress?: string; baseWalletAddress?: string; password?: string } = {
      username: data.username,
    };
    if (data.solanaWalletAddress) updateData.solanaWalletAddress = data.solanaWalletAddress;
    if (data.baseWalletAddress) updateData.baseWalletAddress = data.baseWalletAddress;
    if (data.password) updateData.password = data.password;

    updateMutation.mutate(updateData);
  });

  const handleClaimStreak = async () => {
    setStreakMessage(null);
    try {
      const res = await fetch('/api/streak/claim', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setStreakMessage({ type: 'success', text: `+${data.bonusEth} ETH claimed!` });
        queryClient.invalidateQueries({ queryKey: ['/api/streak'] });
        queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      } else {
        setStreakMessage({ type: 'error', text: data.error || 'Claim failed' });
      }
    } catch {
      setStreakMessage({ type: 'error', text: 'Network error' });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-gain)] animate-pulse" />
            <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">Account</span>
          </div>
          <h1 className="font-serif text-3xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
            {currentUser?.username}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage your profile, balances, and achievements
          </p>
        </div>

        {/* Balance Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {profileLoading ? (
            <>
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </>
          ) : (
            <>
              <BalanceCard
                chain="base"
                balance={baseBalance}
                profit={baseProfit}
                walletAddress={baseWallet}
                price={ethPriceUSD}
              />
              <BalanceCard
                chain="solana"
                balance={solanaBalance}
                profit={solanaProfit}
                walletAddress={solanaWallet}
                price={solPriceUSD}
              />
            </>
          )}
        </div>

        {/* Streak & Referral */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {/* Streak Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-[var(--accent-premium)]" />
                <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">Daily Streak</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {streakData ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <DataCell
                      value={streakData.streakCount}
                      suffix={` day${streakData.streakCount === 1 ? '' : 's'}`}
                      className="text-2xl font-semibold"
                    />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Next bonus: +{streakData.nextBonus} ETH
                    </p>
                    {streakMessage && (
                      <p className={cn(
                        'text-xs mt-2',
                        streakMessage.type === 'success' ? 'text-[var(--accent-gain)]' : 'text-[var(--accent-loss)]'
                      )}>
                        {streakMessage.text}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={!streakData.canClaim}
                    onClick={handleClaimStreak}
                    variant={streakData.canClaim ? 'default' : 'outline'}
                  >
                    {streakData.canClaim ? 'Claim Bonus' : 'Claimed Today'}
                  </Button>
                </div>
              ) : (
                <Skeleton className="h-16" />
              )}
            </CardContent>
          </Card>

          {/* Referral Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-[var(--accent-premium)]" />
                <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">Referral Link</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm font-mono text-[var(--text-secondary)] truncate">
                  {referralLink}
                </div>
                <Button size="sm" variant="outline" onClick={copyReferral} className="shrink-0">
                  {copiedReferral ? <Check className="h-4 w-4 text-[var(--accent-gain)]" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-2">
                Friends get <span className="text-[var(--text-secondary)]">+1 ETH</span> starter bonus. You get <span className="text-[var(--text-secondary)]">+0.5 ETH</span> when they complete their first trade.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Profile Form */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-[var(--text-secondary)]" />
              <CardTitle className="text-base font-medium">Update Profile</CardTitle>
            </div>
            <CardDescription>Edit your username, wallet addresses, and password</CardDescription>
          </CardHeader>
          <CardContent>
            {profileError && (
              <div className="mb-5 rounded-md border border-[var(--accent-loss)]/25 bg-[rgba(194,77,77,0.1)] p-3 text-sm text-[var(--accent-loss)]">
                {profileError}
              </div>
            )}
            <Form {...form}>
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm text-[var(--text-primary)]">Username</FormLabel>
                        <FormControl>
                          <Input
                            className="bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-primary)] focus-visible:border-[var(--border-strong)]"
                            data-testid="input-username"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-[var(--accent-loss)]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm text-[var(--text-primary)]">New Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Leave blank to keep current"
                            className="bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)]"
                            data-testid="input-password"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-[var(--text-tertiary)]">
                          Minimum 6 characters
                        </FormDescription>
                        <FormMessage className="text-[var(--accent-loss)]" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="baseWalletAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-[var(--text-primary)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--chain-base)]" />
                        Base Wallet Address
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)]"
                          data-testid="input-base-wallet"
                          placeholder="0x..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-[var(--text-tertiary)]">
                        For Base trading and rewards
                      </FormDescription>
                      <FormMessage className="text-[var(--accent-loss)]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="solanaWalletAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-[var(--text-primary)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--chain-solana)]" />
                        Solana Wallet Address
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)]"
                          data-testid="input-solana-wallet"
                          placeholder="7xKXtg2CW87d97TXJSDpbD5jBkhe..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-[var(--text-tertiary)]">
                        For Solana trading and rewards
                      </FormDescription>
                      <FormMessage className="text-[var(--accent-loss)]" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-update"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Profile'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Achievements */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--accent-premium)]" />
              <CardTitle className="text-base font-medium">Achievements</CardTitle>
            </div>
            <CardDescription>
              {unlockedBadges.size} of {ALL_BADGE_IDS.length} unlocked
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
