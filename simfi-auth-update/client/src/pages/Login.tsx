import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { TrendingUp, Mail, Lock, ArrowRight, Sparkles } from 'lucide-react';
import type { LoginRequest } from '@shared/schema';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const loginMutation = useMutation<{ user: Omit<import('@shared/schema').User, 'password'> }, Error, LoginRequest>({
    mutationFn: (data) => apiRequest('POST', '/api/auth/login', data),
    onSuccess: (data) => {
      setAuth(data.user);
      toast({
        title: 'Welcome back!',
        description: `Logged in as ${data.user.username}`,
      });
      setLocation('/');
    },
    onError: (error: any) => {
      toast({
        title: 'Login Failed',
        description: error.message || 'Invalid credentials',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    loginMutation.mutate(data);
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
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
          <div className="text-center mb-8">
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

            <h2 className="text-xl font-semibold text-foreground mb-1">Welcome Back!</h2>
            <p className="text-sm text-muted-foreground">Sign in to continue trading</p>
          </div>

          {/* Form */}
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-5">
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
                          className="pl-10 h-12 rounded-xl border-border/50 bg-background/50 focus:border-primary focus:ring-primary/20"
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
                          className="pl-10 h-12 rounded-xl border-border/50 bg-background/50 focus:border-primary focus:ring-primary/20"
                          data-testid="input-password"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg shadow-primary/25 group"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-card text-muted-foreground">New to SimFi?</span>
            </div>
          </div>

          {/* Register link */}
          <Link href="/register">
            <Button
              variant="outline"
              className="w-full h-12 text-base font-medium rounded-xl border-border/50 hover:border-primary/50 hover:bg-primary/5"
              data-testid="link-register"
            >
              Create an Account
            </Button>
          </Link>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            Start with 10 SOL paper balance • Risk-free trading
          </p>
        </div>
      </motion.div>
    </div>
  );
}
