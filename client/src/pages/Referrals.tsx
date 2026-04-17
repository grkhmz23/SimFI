import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Users, UserCheck, Coins, Copy, Check, ArrowRight, Award, Gift } from 'lucide-react';
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

  const { data: stats, isLoading } = useQuery<ReferralStats>({
    queryKey: ['/api/referrals/me'],
    queryFn: async () => {
      const res = await fetch('/api/referrals/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch referrals');
      return res.json();
    },
  });

  const copyLink = async () => {
    if (!stats?.referralLink) return;
    try {
      await navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Award className="h-4 w-4 text-[var(--accent-premium)]" />
            <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">Rewards</span>
          </div>
          <h1 className="font-serif text-3xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif)' }}>
            Referrals
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Invite friends and earn rewards together
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <StatCard icon={Users} label="Total Referred" value={stats?.total || 0} />
            <StatCard icon={UserCheck} label="Converted" value={stats?.converted || 0} variant="gain" />
            <StatCard icon={Coins} label="Pending Rewards" value={stats?.pending || 0} variant="premium" />
          </div>
        )}

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Gift className="h-4 w-4 text-[var(--accent-premium)]" />
              Your Referral Link
            </CardTitle>
            <CardDescription>Share this link with friends to start earning</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-sm font-mono text-[var(--text-secondary)] truncate">
                {stats?.referralLink || 'Loading...'}
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
            <CardDescription>Simple rewards for growing the community</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                step: '1',
                title: 'Share your link',
                desc: 'Send your unique referral link to friends who want to learn trading.',
              },
              {
                step: '2',
                title: 'They get a bonus',
                desc: 'Friends who sign up with your link receive +1 ETH starter bonus.',
              },
              {
                step: '3',
                title: 'You earn rewards',
                desc: 'You receive +0.5 ETH when they complete their first trade.',
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
