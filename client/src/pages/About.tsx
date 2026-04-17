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
  ExternalLink
} from 'lucide-react';
import { SiX } from 'react-icons/si';

export default function About() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden gradient-simfi-radial border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-chart-2/5" />
        <div className="container mx-auto px-4 py-16 md:py-24 relative">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-4 text-sm px-4 py-1.5">About SimFi</Badge>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="gradient-simfi-text">Simulation Finance</span>
              <br />
              <span className="text-foreground">Educational Trading Platform</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              Practice trading Base and Solana memecoins in a risk-free environment. Master your strategy, 
              learn market dynamics, and compete with others—all without risking real money.
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Mission Statement */}
        <Card className="p-8 md:p-12 mb-12 gradient-simfi-border border-2">
          <div className="flex items-start gap-4 mb-6">
            <div className="rounded-full bg-primary/10 p-3 shrink-0">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-4">Our Mission</h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-4">
                SimFi was created to provide a safe, educational environment for learning cryptocurrency trading. 
                We believe everyone should have the opportunity to understand market dynamics and trading strategies 
                without the fear of financial loss.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Our platform is especially valuable for those who struggle with gambling tendencies in crypto markets. 
                By simulating real trading with virtual currency, you can satisfy the excitement of trading while developing 
                healthy habits and strategic thinking.
              </p>
            </div>
          </div>
        </Card>

        {/* For Responsible Trading */}
        <Card className="p-8 mb-12 border-2 border-destructive/20 bg-destructive/5">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-8 w-8 text-destructive shrink-0 mt-1" />
            <div>
              <h3 className="text-2xl font-bold mb-3 flex items-center gap-2">
                <Heart className="h-6 w-6 text-destructive" />
                For Those Struggling with Trading Addiction
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                If you've experienced gambling addiction with memecoins or crypto trading, SimFi offers a healthier alternative. 
                You can experience the thrill of trading and market analysis without risking your financial well-being.
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Zero Financial Risk:</strong> Trade with virtual currency, never real money</span>
                </li>
                <li className="flex items-start gap-2">
                  <Target className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Learn Strategy:</strong> Develop disciplined trading habits in a safe space</span>
                </li>
                <li className="flex items-start gap-2">
                  <TrendingUp className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Real Market Data:</strong> Experience authentic price movements and trends</span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Compete Healthily:</strong> Leaderboard competition focused on skill, not spending</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {/* How It Works */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold mb-8 text-center">How SimFi Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-primary/10 p-3 shrink-0">
                  <Coins className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Virtual Currency</h3>
                  <p className="text-muted-foreground">
                    Start with 5 ETH + 10 SOL of virtual currency. Use it to practice trading real memecoins 
                    with live market prices from top DEXs.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-primary/10 p-3 shrink-0">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Real-Time Data</h3>
                  <p className="text-muted-foreground">
                    Experience authentic market conditions with real-time price feeds, charts, and token launches. 
                    Learn to read markets like a pro.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-primary/10 p-3 shrink-0">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Leaderboard System</h3>
                  <p className="text-muted-foreground">
                    Compete in 6-hour trading periods and climb the ranks by realized profit. 
                    Skill matters, not luck.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-primary/10 p-3 shrink-0">
                  <GraduationCap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Educational Focus</h3>
                  <p className="text-muted-foreground">
                    Build confidence, test strategies, and learn from mistakes—all without financial consequences. 
                    Perfect for beginners and experts alike.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Base-First Future */}
        <Card className="p-8 md:p-12 mb-12 border-2 border-dashed border-primary/30 bg-primary/5">
          <div className="text-center mb-8">
            <Badge className="mb-4 text-sm px-4 py-1.5">Base Chain</Badge>
            <h2 className="text-3xl font-bold mb-3">Reward Distribution Coming Soon</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We're building a sustainable reward system directly on Base. Leaderboard prizes, 
              referral rewards, and achievement bonuses will all be powered by on-chain mechanics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 border border-border/50 bg-card/50">
              <div className="flex items-center gap-3 mb-3">
                <BarChart3 className="h-6 w-6 text-primary" />
                <h3 className="text-xl font-bold">Leaderboard Prizes</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Top traders in each period will receive on-chain rewards distributed transparently on Base.
              </p>
            </Card>

            <Card className="p-6 border border-border/50 bg-card/50">
              <div className="flex items-center gap-3 mb-3">
                <ArrowRight className="h-6 w-6 text-chart-2" />
                <h3 className="text-xl font-bold">Platform Growth</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Fees reinvested into better charts, faster APIs, and new features to make SimFi 
                the best educational trading tool in the space.
              </p>
            </Card>

            <Card className="p-6 border border-border/50 bg-card/50">
              <div className="flex items-center gap-3 mb-3">
                <Users className="h-6 w-6 text-chart-3" />
                <h3 className="text-xl font-bold">Community First</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                A portion of platform value flows back to active users through referrals, 
                streaks, and achievement rewards.
              </p>
            </Card>
          </div>
        </Card>

        {/* Social Links */}
        <Card className="p-8 mb-12">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Join Our Community</h2>
            <p className="text-muted-foreground">
              Connect with us on X (Twitter) for updates, tips, and community discussions
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <a
              href="https://x.com/i/communities/1981329893569835367"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="p-6 hover-elevate active-elevate-2 cursor-pointer transition-all">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-primary/10 p-3 shrink-0">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <SiX className="h-4 w-4" />
                      <h3 className="font-semibold">SimFi Community</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Join our X community for discussions
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Card>
            </a>

            <a
              href="https://x.com/uncgorkh?s=21"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="p-6 hover-elevate active-elevate-2 cursor-pointer transition-all">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-chart-2/10 p-3 shrink-0">
                    <ArrowRight className="h-6 w-6 text-chart-2" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <SiX className="h-4 w-4" />
                      <h3 className="font-semibold">Developer</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Follow the SimFi developer on X
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Card>
            </a>
          </div>
        </Card>

        {/* Call to Action */}
        <div className="text-center section-gradient-bottom rounded-lg p-12">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Learning?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join SimFi today and start your journey toward becoming a skilled trader—without risking a single dollar
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => setLocation('/register')}
              className="gradient-simfi text-white hover:opacity-90 transition-opacity gap-2"
              data-testid="button-get-started"
            >
              <ArrowRight className="h-5 w-5" />
              Get Started Free
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setLocation('/leaderboard')}
              data-testid="button-view-leaderboard"
            >
              <BarChart3 className="h-5 w-5" />
              View Leaderboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
