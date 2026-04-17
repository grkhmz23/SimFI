import { useEffect } from 'react';
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
import { TrendingUp, Mail, Lock, User, Wallet, ArrowRight, Sparkles, Gift, Trophy, Zap } from 'lucide-react';
import { z } from 'zod';
import type { RegisterRequest } from '@shared/schema';

// Custom schema for registration with both wallets
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

  // Sync global chain selector with form field
  useEffect(() => {
    form.setValue('preferredChain', activeChain);
  }, [activeChain, form]);

  const registerMutation = useMutation<{ user: Omit<import('@shared/schema').User, 'password'> }, Error, RegisterRequest & { referralCode?: string }>({
    mutationFn: (data) => apiRequest('POST', '/api/auth/register', data),
    onSuccess: (data) => {
      setAuth(data.user);
      toast({
        title: 'Account Created!',
        description: `Welcome ${data.user.username}! Start trading on Base or Solana.`,
      });
      setLocation('/');
    },
    onError: (error: any) => {
      console.error('Registration failed:', error);
      toast({
        title: 'Registration Failed',
        description: error.message || 'Could not create account',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    // Convert to API format
    const apiData: RegisterRequest & { referralCode?: string } = {
      username: data.username.trim(),
      email: data.email.trim(),
      password: data.password,
      solanaWalletAddress: data.solanaWalletAddress?.trim() || undefined,
      baseWalletAddress: data.baseWalletAddress?.trim() || undefined,
      preferredChain: data.preferredChain,
      referralCode,
    };
    console.log('Register payload:', apiData);
    registerMutation.mutate(apiData);
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Card glow */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-accent/50 rounded-3xl blur opacity-30" />
        
        {/* Card */}
        <div className="relative bg-card/95 backdrop-blur-xl border border-border/50 rounded-3xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg animate-pulse" />
                <div className="relative w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
                  <img 
                    src="/simfi-logo.png" 
                    alt="SimFi" 
                    className="w-10 h-10 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <TrendingUp className="w-8 h-8 text-primary-foreground hidden" />
                </div>
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  SimFi
                </h1>
                <p className="text-xs text-muted-foreground">Paper Trading</p>
              </div>
            </div>

            <h2 className="text-xl font-semibold text-foreground mb-1">Create Account</h2>
            <p className="text-sm text-muted-foreground">Start your trading journey</p>
          </div>

          {/* Benefits */}
          <div className="flex justify-center gap-4 mb-6">
            {[
              { icon: Gift, label: '5 ETH + 10 SOL', color: 'text-green-500' },
              { icon: Trophy, label: 'Rewards', color: 'text-yellow-500' },
              { icon: Zap, label: 'Multi-Chain', color: 'text-primary' },
            ].map((item, index) => (
              <div key={index} className="flex flex-col items-center gap-1">
                <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${item.color}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>

          {referralCode && (
            <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-center text-sm">
              You were referred by <span className="font-semibold text-primary">@{referralCode}</span>
              <p className="text-xs text-muted-foreground mt-1">You&apos;ll get +1 ETH bonus on signup</p>
            </div>
          )}

          {/* Preferred Chain Selector */}
          <div className="mb-6">
            <label className="text-sm font-medium mb-2 block">Preferred Chain</label>
            <ChainSelector variant="pill" className="w-full justify-center" />
          </div>

          {/* Form */}
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
                          className="pl-10 h-11 rounded-xl border-border/50 bg-background/50 focus:border-primary"
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
                          className="pl-10 h-11 rounded-xl border-border/50 bg-background/50 focus:border-primary"
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
                          type="password"
                          placeholder="••••••••"
                          className="pl-10 h-11 rounded-xl border-border/50 bg-background/50 focus:border-primary"
                          data-testid="input-password"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Base Wallet Address */}
              <FormField
                control={form.control}
                name="baseWalletAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Base Wallet Address (for rewards)
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="0x..."
                          className="pl-10 h-11 rounded-xl border-border/50 bg-background/50 focus:border-primary font-mono text-sm"
                          data-testid="input-base-wallet"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      Required for Base trading and rewards
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Solana Wallet Address */}
              <FormField
                control={form.control}
                name="solanaWalletAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      Solana Wallet Address (for rewards)
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="7xKXtg2CW87d97TXJSDpbD5jBkhe..."
                          className="pl-10 h-11 rounded-xl border-border/50 bg-background/50 focus:border-primary font-mono text-sm"
                          data-testid="input-solana-wallet"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      Required for Solana trading and rewards
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Validation Message */}
              {(form.formState.errors.solanaWalletAddress?.message?.includes('required') || 
                form.formState.errors.baseWalletAddress?.message?.includes('required')) && (
                <p className="text-xs text-destructive">
                  At least one wallet address is required
                </p>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg shadow-primary/25 group mt-2"
                disabled={registerMutation.isPending}
                data-testid="button-register"
              >
                {registerMutation.isPending ? (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-card text-muted-foreground">Already have an account?</span>
            </div>
          </div>

          {/* Login link */}
          <Link href="/login">
            <Button
              variant="outline"
              className="w-full h-11 text-sm font-medium rounded-xl border-border/50 hover:border-primary/50 hover:bg-primary/5"
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
