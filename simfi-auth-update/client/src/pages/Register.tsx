import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { TrendingUp, Mail, Lock, User, Wallet, ArrowRight, Sparkles, Gift, Trophy, Zap, X } from 'lucide-react';
import { insertUserSchema, type RegisterRequest } from '@shared/schema';

export default function Register() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const { toast } = useToast();

  const form = useForm<RegisterRequest>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      walletAddress: '',
    },
  });

  const registerMutation = useMutation<{ user: Omit<import('@shared/schema').User, 'password'> }, Error, RegisterRequest>({
    mutationFn: (data) => apiRequest('POST', '/api/auth/register', data),
    onSuccess: (data) => {
      setAuth(data.user);
      toast({
        title: 'Account Created! 🎉',
        description: `Welcome ${data.user.username}! You have 10 SOL to start trading.`,
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
    registerMutation.mutate(data);
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
          {/* Close button */}
          <button
            onClick={() => setLocation('/')}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors group"
            aria-label="Close and return to home"
          >
            <X className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>

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
              { icon: Gift, label: "10 SOL", color: "text-green-500" },
              { icon: Trophy, label: "Rewards", color: "text-yellow-500" },
              { icon: Zap, label: "Real-time", color: "text-primary" },
            ].map((item, index) => (
              <div key={index} className="flex flex-col items-center gap-1">
                <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${item.color}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            ))}
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

              <FormField
                control={form.control}
                name="walletAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Solana Wallet Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="7xKXtg2CW87d97TXJSDpbD5jBkhe..."
                          className="pl-10 h-11 rounded-xl border-border/50 bg-background/50 focus:border-primary font-mono text-sm"
                          data-testid="input-wallet"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground">
                      Required for receiving leaderboard rewards
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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