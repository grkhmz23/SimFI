import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';
import { useLocation } from 'wouter';
import { Users, UserCheck, Coins, Copy, Check, Gift, AlertCircle, RefreshCw, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReferralStats {
  username: string;
  referralLink: string;
  total: number;
  converted: number;
  pending: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  variant = 'default',
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  variant?: 'default' | 'gain' | 'premium';
}) {
  const iconBg =
    variant === 'gain'
      ? 'bg-[rgba(63,168,118,0.1)] text-[var(--accent-gain)]'
      : variant === 'premium'
      ? 'bg-[rgba(201,169,110,0.1)] text-[var(--accent-premium)]'
      : 'bg-[var(--bg-base)] text-[var(--text-secondary)]';

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-subtle)]', iconBg)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
            <p className="text-xl font-mono tabular-nums font-semibold text-[var(--text-primary)]">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Referrals() {
  const [copied, setCopied] = useState(false);
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading, isError, refetch } = useQuery<ReferralStats>({
    queryKey: ['/api/referrals/me'],
    queryFn: async () => {
      const res = await fetch('/api/referrals/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch referrals');
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const copyLink = async () => {
    if (!stats?.referralLink) return;
    try {
      await navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="min-h-[60vh] flex items-center justify-center">
            <Card className="p-10 text-center max-w-md w-full">
              <LogIn className="h-12 w-12 mx-auto text-[var(--text-secondary)] mb-4" />
              <h2 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Login Required</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Log in to get your referral link and invite friends to SimFI.
              </p>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={() => setLocation('/login')}>Login</Button>
                <Button variant="outline" className="flex-1" onClick={() => setLocation('/register')}>Register</Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-[var(--text-primary)]">
            Referrals
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Invite friends to SimFI and both of you get a paper trading bonus.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            All bonuses are paper (simulated) ETH — no real money involved.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center mb-8">
            <AlertCircle className="h-7 w-7 text-[var(--text-tertiary)]" />
            <p className="text-sm text-[var(--text-secondary)]">Could not load referral data</p>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-md px-3 py-1.5 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <StatCard icon={Users} label="Total Referred" value={stats?.total || 0} />
            <StatCard icon={UserCheck} label="Converted" value={stats?.converted || 0} variant="gain" />
            <StatCard icon={Coins} label="Pending" value={stats?.pending || 0} variant="premium" />
          </div>
        )}

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Gift className="h-4 w-4 text-[var(--accent-premium)]" />
              Your Referral Link
            </CardTitle>
            <CardDescription>Share this link to invite friends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-sm font-mono text-[var(--text-secondary)] truncate">
                {stats?.referralLink || (isLoading ? 'Loading…' : '—')}
              </div>
              <Button size="sm" variant="outline" onClick={copyLink} disabled={!stats?.referralLink} className="shrink-0">
                {copied ? (
                  <Check className="h-4 w-4 text-[var(--accent-gain)]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">How It Works</CardTitle>
            <CardDescription>Paper trading bonuses for growing the community</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                step: '1',
                title: 'Share your link',
                desc: 'Send your unique referral link to friends who want to learn paper trading.',
              },
              {
                step: '2',
                title: 'They get a starter bonus',
                desc: 'Friends who sign up with your link receive +1 paper ETH to start trading with.',
              },
              {
                step: '3',
                title: 'You earn a bonus',
                desc: 'You receive +0.5 paper ETH when they complete their first trade. All paper — no real money.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex items-start gap-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-secondary)]">
                  {step}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
