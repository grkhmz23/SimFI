import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { BarChart3, BookOpen, Search, ArrowRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const features = [
  {
    icon: Search,
    title: 'Token Analysis',
    description: 'Deep dive into token metrics, holder distribution, and liquidity analysis.',
  },
  {
    icon: BarChart3,
    title: 'Pro Charts',
    description: 'Professional-grade charting with indicators and multi-timeframe analysis.',
  },
  {
    icon: BookOpen,
    title: 'Trading Academy',
    description: 'Learn strategies, risk management, and market psychology.',
  },
];

export default function TokenAnalyzer() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
        <Badge variant="premium" className="mb-6">
          <Clock className="w-3 h-3 mr-1.5" />
          Coming Soon
        </Badge>

        <h1
          className="font-serif text-4xl md:text-5xl text-[var(--text-primary)] mb-4"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Study
        </h1>
        <p className="text-base text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed mb-10">
          Advanced analytics, wallet explorers, and educational tools to help you master memecoin trading. Launching soon.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="p-6 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] mb-4">
                <Icon className="h-5 w-5 text-[var(--text-secondary)]" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{description}</p>
            </Card>
          ))}
        </div>

        <Button onClick={() => setLocation('/')} className="gap-2">
          Start Trading
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
