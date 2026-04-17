import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
import { useChain } from '@/lib/chain-context';
import { apiRequest } from '@/lib/queryClient';
import { useMutation } from '@tanstack/react-query';
import { ChainSelector } from '@/components/ChainSelector';
import { Mail, Lock, User, Wallet, ArrowRight, Eye, EyeOff, Loader2, Zap, Target, BarChart3 } from 'lucide-react';
import { z } from 'zod';
import type { RegisterRequest } from '@shared/schema';
import { cn } from '@/lib/utils';

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, underscores, and hyphens'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  solanaWalletAddress: z.string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address')
    .optional()
    .or(z.literal('')),
  baseWalletAddress: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Base address')
    .optional()
    .or(z.literal('')),
  preferredChain: z.enum(['base', 'solana']).default('base'),
  referralCode: z.string().optional().or(z.literal('')),
}).refine(
  (data) => data.solanaWalletAddress || data.baseWalletAddress,
  { message: 'At least one wallet address (Solana or Base) is required', path: ['solanaWalletAddress'] }
);

type FormData = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const urlReferralCode = params.get('ref') || '';
  const { setAuth } = useAuth();
  const { activeChain } = useChain();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      solanaWalletAddress: '',
      baseWalletAddress: '',
      preferredChain: activeChain,
      referralCode: urlReferralCode,
    },
  });

  useEffect(() => {
    form.setValue('preferredChain', activeChain);
  }, [activeChain, form]);

  const registerMutation = useMutation<
    { user: Omit<import('@shared/schema').User, 'password'> },
    Error,
    RegisterRequest & { referralCode?: string }
  >({
    mutationFn: (data) => apiRequest('POST', '/api/auth/register', data),
    onSuccess: (data) => {
      setAuth(data.user);
      setLocation('/');
    },
    onError: (error) => {
      setServerError(error.message || 'Could not create account');
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    setServerError(null);
    const apiData: RegisterRequest & { referralCode?: string } = {
      username: data.username.trim(),
      email: data.email.trim(),
      password: data.password,
      solanaWalletAddress: data.solanaWalletAddress?.trim() || undefined,
      baseWalletAddress: data.baseWalletAddress?.trim() || undefined,
      preferredChain: data.preferredChain,
      referralCode: data.referralCode?.trim() || urlReferralCode || undefined,
    };
    registerMutation.mutate(apiData);
  });

  const hasWalletError = form.formState.errors.solanaWalletAddress?.message?.includes('required') ||
    form.formState.errors.baseWalletAddress?.message?.includes('required');

  return (
    <div className="min-h-screen flex bg-[var(--bg-base)]">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-sm py-8">
          <div className="mb-8">
            <Link href="/">
              <span className="inline-flex items-center gap-2 mb-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--text-primary)] text-[var(--bg-base)] font-bold text-sm">
                  S
                </span>
                <span className="font-semibold tracking-tight text-[var(--text-primary)]">SimFi</span>
              </span>
            </Link>
            <h1 className="font-serif text-3xl text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              Create account
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Start your paper trading journey
            </p>
          </div>

          {serverError && (
            <div className="mb-5 rounded-md border border-[var(--accent-loss)]/25 bg-[rgba(194,77,77,0.1)] p-3 text-sm text-[var(--accent-loss)]">
              {serverError}
            </div>
          )}

          <div className="mb-5">
            <label className="text-sm font-medium text-[var(--text-primary)] mb-2 block">Preferred Chain</label>
            <ChainSelector variant="pill" className="w-full justify-center" />
          </div>

          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[var(--text-primary)]">Username</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                        <Input
                          placeholder="trader123"
                          className="pl-10 h-11 bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)]"
                          data-testid="input-username"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[var(--accent-loss)]" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[var(--text-primary)]">Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          className="pl-10 h-11 bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)]"
                          data-testid="input-email"
                          {...field}
                        />
                      </div>
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
                    <FormLabel className="text-sm font-medium text-[var(--text-primary)]">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          className="pl-10 pr-10 h-11 bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)]"
                          data-testid="input-password"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-[var(--accent-loss)]" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="baseWalletAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#6fa8dc]" />
                      Base Wallet Address
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                        <Input
                          placeholder="0x..."
                          className="pl-10 h-11 bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)] font-mono text-sm"
                          data-testid="input-base-wallet"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs text-[var(--text-tertiary)]">
                      Required for Base trading
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
                    <FormLabel className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#b794f6]" />
                      Solana Wallet Address
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                        <Input
                          placeholder="7xKXtg2CW87d97TXJSDpbD5jBkhe..."
                          className="pl-10 h-11 bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)] font-mono text-sm"
                          data-testid="input-solana-wallet"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs text-[var(--text-tertiary)]">
                      Required for Solana trading
                    </FormDescription>
                    <FormMessage className="text-[var(--accent-loss)]" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="referralCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[var(--text-primary)]">
                      Referral Code <span className="text-[var(--text-tertiary)] font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter referral code"
                        className="h-11 bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)] font-mono text-sm uppercase"
                        data-testid="input-referral-code"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-[var(--accent-loss)]" />
                  </FormItem>
                )}
              />

              {hasWalletError && (
                <p className="text-xs text-[var(--accent-loss)]">
                  At least one wallet address is required
                </p>
              )}

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90 mt-2"
                disabled={registerMutation.isPending}
                data-testid="button-register"
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
            <p className="text-center text-sm text-[var(--text-secondary)]">
              Already have an account?{' '}
              <Link href="/login">
                <span className="text-[var(--text-primary)] hover:underline cursor-pointer font-medium">
                  Sign in
                </span>
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right: Editorial brand panel */}
      <div className="hidden lg:flex flex-1 relative bg-[var(--bg-raised)] border-l border-[var(--border-subtle)] items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, var(--text-primary) 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />

        <div className="relative max-w-md">
          <div className="mb-8">
            <h2
              className="text-4xl leading-tight text-[var(--text-primary)] mb-4"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Learn to trade
              <br />
              <span className="text-[var(--accent-premium)]">before you risk</span>
            </h2>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              SimFi gives you a realistic trading environment with live market data—so you can sharpen your edge without losing a dollar.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(63,168,118,0.1)] border border-[var(--border-gain)]">
                <Zap className="h-5 w-5 text-[var(--accent-gain)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">5 ETH + 10 SOL starting balance</p>
                <p className="text-xs text-[var(--text-tertiary)]">Enough to practice real strategies</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(201,169,110,0.1)] border border-[rgba(201,169,110,0.2)]">
                <Target className="h-5 w-5 text-[var(--accent-premium)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Achievement system</p>
                <p className="text-xs text-[var(--text-tertiary)]">Earn badges as you improve</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(63,168,118,0.1)] border border-[var(--border-gain)]">
                <BarChart3 className="h-5 w-5 text-[var(--accent-gain)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Compete on leaderboards</p>
                <p className="text-xs text-[var(--text-tertiary)]">6-hour trading periods, skill-based ranks</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
