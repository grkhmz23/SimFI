import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useSearch } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
import { useChain } from '@/lib/chain-context';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { ChainSelector } from '@/components/ChainSelector';
import { Mail, Lock, User, Wallet, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { z } from 'zod';
import type { RegisterRequest } from '@shared/schema';

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(6),
  solanaWalletAddress: z.string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address')
    .optional()
    .or(z.literal('')),
  baseWalletAddress: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Base address')
    .optional()
    .or(z.literal('')),
  preferredChain: z.enum(['base', 'solana']).default('base'),
}).refine(
  (data) => data.solanaWalletAddress || data.baseWalletAddress,
  { message: "At least one wallet address (Solana or Base) is required", path: ['solanaWalletAddress'] }
);

type FormData = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const referralCode = params.get('ref') || undefined;
  const { setAuth } = useAuth();
  const { toast } = useToast();
  const { activeChain } = useChain();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      solanaWalletAddress: '',
      baseWalletAddress: '',
      preferredChain: activeChain,
    },
  });

  useEffect(() => {
    form.setValue('preferredChain', activeChain);
  }, [activeChain, form]);

  const registerMutation = useMutation<{ user: Omit<import('@shared/schema').User, 'password'> }, Error, RegisterRequest & { referralCode?: string }>({
    mutationFn: (data) => apiRequest('POST', '/api/auth/register', data),
    onSuccess: (data) => {
      setAuth(data.user);
      toast({
        title: 'Account Created',
        description: `Welcome, ${data.user.username}. You can now start trading.`,
      });
      setLocation('/');
    },
    onError: (error: any) => {
      toast({
        title: 'Registration Failed',
        description: error.message || 'Could not create account',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    const apiData: RegisterRequest & { referralCode?: string } = {
      username: data.username.trim(),
      email: data.email.trim(),
      password: data.password,
      solanaWalletAddress: data.solanaWalletAddress?.trim() || undefined,
      baseWalletAddress: data.baseWalletAddress?.trim() || undefined,
      preferredChain: data.preferredChain,
      referralCode,
    };
    registerMutation.mutate(apiData);
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-md"
      >
        <div className="relative bg-card border border-border rounded-2xl p-8 shadow-xl">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="relative w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">S</span>
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">SimFi</h1>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Paper Trading</p>
              </div>
            </div>

            <h2 className="text-lg font-medium text-foreground mb-1">Create Account</h2>
            <p className="text-sm text-muted-foreground">Register to start paper trading</p>
          </div>

          {referralCode && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-center text-sm">
              Referred by <span className="font-medium text-primary">@{referralCode}</span>
            </div>
          )}

          <div className="mb-5">
            <label className="text-sm font-medium mb-2 block">Preferred Chain</label>
            <ChainSelector variant="pill" className="w-full justify-center" />
          </div>

          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Username</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="trader123"
                          className="pl-10 h-11 rounded-lg border-border bg-background focus:border-primary"
                          data-testid="input-username"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          className="pl-10 h-11 rounded-lg border-border bg-background focus:border-primary"
                          data-testid="input-email"
                          {...field}
                        />
                      </div>
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
                    <FormLabel className="text-sm font-medium">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          className="pl-10 pr-10 h-11 rounded-lg border-border bg-background focus:border-primary"
                          data-testid="input-password"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="baseWalletAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Base Wallet Address
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="0x..."
                          className="pl-10 h-11 rounded-lg border-border bg-background focus:border-primary font-mono text-sm"
                          data-testid="input-base-wallet"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      Required for Base trading
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="solanaWalletAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      Solana Wallet Address
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="7xKXtg2CW87d97TXJSDpbD5jBkhe..."
                          className="pl-10 h-11 rounded-lg border-border bg-background focus:border-primary font-mono text-sm"
                          data-testid="input-solana-wallet"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      Required for Solana trading
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(form.formState.errors.solanaWalletAddress?.message?.includes('required') ||
                form.formState.errors.baseWalletAddress?.message?.includes('required')) && (
                <p className="text-xs text-destructive">
                  At least one wallet address is required
                </p>
              )}

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground mt-2"
                disabled={registerMutation.isPending}
                data-testid="button-register"
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-card text-muted-foreground">Already have an account?</span>
            </div>
          </div>

          <Link href="/login">
            <Button
              variant="outline"
              className="w-full h-11 text-sm font-medium rounded-lg border-border hover:bg-muted"
              data-testid="link-login"
            >
              Sign In
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
