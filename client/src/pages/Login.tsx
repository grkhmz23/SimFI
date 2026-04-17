import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/queryClient';
import { useMutation } from '@tanstack/react-query';
import { Mail, Lock, ArrowRight, Eye, EyeOff, Loader2, TrendingUp, Shield, Coins } from 'lucide-react';
import type { LoginRequest } from '@shared/schema';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().min(1, 'Email or username is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const loginMutation = useMutation<
    { user: Omit<import('@shared/schema').User, 'password'> },
    Error,
    LoginRequest
  >({
    mutationFn: (data) => apiRequest('POST', '/api/auth/login', data),
    onSuccess: (data) => {
      setAuth(data.user);
      setLocation('/');
    },
    onError: (error) => {
      setServerError(error.message || 'Invalid credentials');
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    setServerError(null);
    loginMutation.mutate(data as LoginRequest);
  });

  return (
    <div className="min-h-screen flex bg-[var(--bg-base)]">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <Link href="/">
              <span className="inline-flex items-center gap-2 mb-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--text-primary)] text-[var(--bg-base)] font-bold text-sm">
                  S
                </span>
                <span className="font-semibold tracking-tight text-[var(--text-primary)]">SimFi</span>
              </span>
            </Link>
            <h1 className="font-serif text-3xl text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              Welcome back
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Sign in to your paper trading account
            </p>
          </div>

          {serverError && (
            <div className="mb-5 rounded-md border border-[var(--accent-loss)]/25 bg-[rgba(194,77,77,0.1)] p-3 text-sm text-[var(--accent-loss)]">
              {serverError}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[var(--text-primary)]">
                      Email or Username
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                        <Input
                          type="text"
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
                    <FormLabel className="text-sm font-medium text-[var(--text-primary)]">
                      Password
                    </FormLabel>
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

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
            <p className="text-center text-sm text-[var(--text-secondary)]">
              New to SimFi?{' '}
              <Link href="/register">
                <span className="text-[var(--text-primary)] hover:underline cursor-pointer font-medium">
                  Create account
                </span>
              </Link>
            </p>
            <p className="text-center text-xs text-[var(--text-tertiary)] mt-3">
              Start with 5 ETH + 10 SOL paper balance. Risk-free trading.
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
              Master trading
              <br />
              <span className="text-[var(--accent-premium)]">without risk</span>
            </h2>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Practice on Base and Solana with real market data. Build strategies, compete on leaderboards, and learn before you deploy real capital.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(63,168,118,0.1)] border border-[var(--border-gain)]">
                <TrendingUp className="h-5 w-5 text-[var(--accent-gain)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Real-time market data</p>
                <p className="text-xs text-[var(--text-tertiary)]">Live prices from top DEXs</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(201,169,110,0.1)] border border-[rgba(201,169,110,0.2)]">
                <Shield className="h-5 w-5 text-[var(--accent-premium)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Zero financial risk</p>
                <p className="text-xs text-[var(--text-tertiary)]">Paper balance, real experience</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(63,168,118,0.1)] border border-[var(--border-gain)]">
                <Coins className="h-5 w-5 text-[var(--accent-gain)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Multi-chain support</p>
                <p className="text-xs text-[var(--text-tertiary)]">Base and Solana memecoins</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
