import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import {
  GraduationCap,
  Shield,
  BarChart3,
  Heart,
  Coins,
  TrendingUp,
  Users,
  Target,
  ArrowRight,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { SiX } from 'react-icons/si';
import { FaTelegram } from 'react-icons/fa';
import { cn } from '@/lib/utils';

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
          <Icon className="h-5 w-5 text-[var(--text-secondary)]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
        </div>
      </div>
    </Card>
  );
}

export default function About() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Hero */}
      <div className="border-b border-[var(--border-subtle)]">
        <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl text-center">
          <Badge variant="outline" className="mb-6">
            About SimFi
          </Badge>
          <h1
            className="text-4xl md:text-5xl text-[var(--text-primary)] mb-6 leading-tight"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Simulation Finance
            <br />
            <span className="text-[var(--accent-premium)]">Educational Trading</span>
          </h1>
          <p className="text-base md:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
            Practice trading Base and Solana memecoins in a risk-free environment. Master your
            strategy, learn market dynamics, and compete with others—all without risking real money.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Mission */}
        <Card className="p-8 md:p-10 mb-10">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
              <GraduationCap className="h-5 w-5 text-[var(--accent-premium)]" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">Our Mission</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
                SimFi was created to provide a safe, educational environment for learning
                cryptocurrency trading. We believe everyone should have the opportunity to understand
                market dynamics and trading strategies without the fear of financial loss.
              </p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Our platform is especially valuable for those who struggle with gambling tendencies
                in crypto markets. By simulating real trading with virtual currency, you can satisfy
                the excitement of trading while developing healthy habits and strategic thinking.
              </p>
            </div>
          </div>
        </Card>

        {/* Responsible Trading */}
        <div className="rounded-lg border border-[var(--accent-loss)]/20 bg-[rgba(194,77,77,0.05)] p-8 mb-10">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-[var(--accent-loss)] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <Heart className="h-4 w-4 text-[var(--accent-loss)]" />
                For Those Struggling with Trading Addiction
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                If you&apos;ve experienced gambling addiction with memecoins or crypto trading, SimFi
                offers a healthier alternative. You can experience the thrill of trading and market
                analysis without risking your financial well-being.
              </p>
              <ul className="space-y-3">
                {[
                  { icon: Shield, text: 'Zero Financial Risk', desc: 'Trade with virtual currency, never real money' },
                  { icon: Target, text: 'Learn Strategy', desc: 'Develop disciplined trading habits in a safe space' },
                  { icon: TrendingUp, text: 'Real Market Data', desc: 'Experience authentic price movements and trends' },
                  { icon: Users, text: 'Compete Healthily', desc: 'Leaderboard competition focused on skill, not spending' },
                ].map(({ icon: Icon, text, desc }) => (
                  <li key={text} className="flex items-start gap-3">
                    <Icon className="h-4 w-4 text-[var(--text-secondary)] shrink-0 mt-0.5" />
                    <span className="text-sm text-[var(--text-secondary)]">
                      <strong className="text-[var(--text-primary)]">{text}:</strong> {desc}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-10">
          <h2 className="font-serif text-2xl text-[var(--text-primary)] mb-6 text-center" style={{ fontFamily: 'var(--font-serif)' }}>
            How SimFi Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeatureCard
              icon={Coins}
              title="Virtual Currency"
              description="Start with 5 ETH + 10 SOL of virtual currency. Use it to practice trading real memecoins with live market prices from top DEXs."
            />
            <FeatureCard
              icon={TrendingUp}
              title="Real-Time Data"
              description="Experience authentic market conditions with real-time price feeds, charts, and token launches. Learn to read markets like a pro."
            />
            <FeatureCard
              icon={BarChart3}
              title="Leaderboard System"
              description="Compete in 6-hour trading periods and climb the ranks by realized profit. Skill matters, not luck."
            />
            <FeatureCard
              icon={GraduationCap}
              title="Educational Focus"
              description="Build confidence, test strategies, and learn from mistakes—all without financial consequences. Perfect for beginners and experts alike."
            />
          </div>
        </div>

        {/* Base Future */}
        <Card className="p-8 md:p-10 mb-10 border-dashed border-[var(--accent-premium)]/30 bg-[rgba(201,169,110,0.03)]">
          <div className="text-center mb-8">
            <Badge variant="premium" className="mb-4">
              Base Chain
            </Badge>
            <h2 className="font-serif text-2xl text-[var(--text-primary)] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
              Reward Distribution Coming Soon
            </h2>
            <p className="text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
              We&apos;re building a sustainable reward system directly on Base. Leaderboard prizes,
              referral rewards, and achievement bonuses will all be powered by on-chain mechanics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: BarChart3, title: 'Leaderboard Prizes', desc: 'Top traders in each period will receive on-chain rewards distributed transparently on Base.' },
              { icon: ArrowRight, title: 'Platform Growth', desc: 'Fees reinvested into better charts, faster APIs, and new features to make SimFi the best educational trading tool.' },
              { icon: Users, title: 'Community First', desc: 'A portion of platform value flows back to active users through referrals, streaks, and achievement rewards.' },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="p-5 bg-[var(--bg-base)]">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-[var(--accent-premium)]" />
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{desc}</p>
              </Card>
            ))}
          </div>
        </Card>

        {/* Community */}
        <Card className="p-8 mb-10">
          <div className="text-center mb-6">
            <h2 className="font-serif text-xl text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              Join Our Community
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Connect with us on X and Telegram for updates, tips, and community discussions
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <a
              href="https://x.com/sim_fi_"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="p-5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                    <SiX className="h-5 w-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <SiX className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">@sim_fi_</span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">Follow SimFi on X for news & drops</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
                </div>
              </Card>
            </a>

            <a
              href="https://t.me/sim_fi_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="p-5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                    <FaTelegram className="h-5 w-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <FaTelegram className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">@sim_fi_bot</span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">Trade directly from Telegram</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
                </div>
              </Card>
            </a>

            <a
              href="https://x.com/i/communities/1981329893569835367"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="p-5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                    <Users className="h-5 w-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <SiX className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">SimFi Community</span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">Join our X community for discussions</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
                </div>
              </Card>
            </a>

            <a
              href="https://x.com/uncgorkh?s=21"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="p-5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                    <ArrowRight className="h-5 w-5 text-[var(--text-secondary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <SiX className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">Developer</span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">Follow the SimFi developer on X</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
                </div>
              </Card>
            </a>
          </div>
        </Card>

        {/* CTA */}
        <div className="text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-10 md:p-12">
          <h2 className="font-serif text-2xl text-[var(--text-primary)] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
            Ready to Start Learning?
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-lg mx-auto">
            Join SimFi today and start your journey toward becoming a skilled trader—without risking
            a single dollar
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => setLocation('/register')}
              className="gap-2"
              data-testid="button-get-started"
            >
              <ArrowRight className="h-4 w-4" />
              Get Started Free
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/leaderboard')}
              data-testid="button-view-leaderboard"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              View Leaderboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
