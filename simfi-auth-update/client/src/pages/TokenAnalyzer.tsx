// client/src/pages/TokenAnalyzer.tsx
// Study Section - Coming Soon with Lamp Background & Modern UI

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  Wallet, 
  Activity, 
  BarChart3, 
  Shield, 
  Zap,
  BookOpen,
  TrendingUp,
  ArrowRight,
  Sparkles,
  GraduationCap,
  Target
} from 'lucide-react';
import { SiX } from 'react-icons/si';

// =============================================================================
// LAMP BACKGROUND COMPONENT
// =============================================================================
const LampBackground = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Lamp Effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[50vh] flex items-start justify-center">
          {/* Left cone */}
          <motion.div
            initial={{ opacity: 0.5, width: "15rem" }}
            animate={{ opacity: 1, width: "30rem" }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
            style={{
              backgroundImage: `conic-gradient(from 70deg at center top, hsl(var(--primary)), transparent)`,
            }}
            className="absolute right-1/2 h-56 bg-gradient-conic from-primary via-transparent to-transparent"
          >
            <div className="absolute w-full left-0 bg-background h-40 bottom-0 [mask-image:linear-gradient(to_top,white,transparent)]" />
            <div className="absolute w-40 h-full left-0 bg-background [mask-image:linear-gradient(to_right,white,transparent)]" />
          </motion.div>
          
          {/* Right cone */}
          <motion.div
            initial={{ opacity: 0.5, width: "15rem" }}
            animate={{ opacity: 1, width: "30rem" }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
            style={{
              backgroundImage: `conic-gradient(from 290deg at center top, transparent, transparent, hsl(var(--primary)))`,
            }}
            className="absolute left-1/2 h-56 bg-gradient-conic from-transparent via-transparent to-primary"
          >
            <div className="absolute w-40 h-full right-0 bg-background [mask-image:linear-gradient(to_left,white,transparent)]" />
            <div className="absolute w-full right-0 bg-background h-40 bottom-0 [mask-image:linear-gradient(to_top,white,transparent)]" />
          </motion.div>

          {/* Blur effects */}
          <div className="absolute top-1/2 h-48 w-full translate-y-12 scale-x-150 bg-background blur-2xl" />
          <div className="absolute top-1/2 h-48 w-full bg-transparent opacity-10 backdrop-blur-md" />
          <div className="absolute inset-auto h-36 w-[28rem] -translate-y-1/2 rounded-full bg-primary opacity-50 blur-3xl" />
          
          {/* Animated glow */}
          <motion.div
            initial={{ width: "8rem" }}
            animate={{ width: "16rem" }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
            className="absolute h-36 -translate-y-[6rem] rounded-full bg-primary/80 blur-2xl"
          />
          
          {/* Light bar */}
          <motion.div
            initial={{ width: "15rem" }}
            animate={{ width: "30rem" }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
            className="absolute h-0.5 -translate-y-[7rem] bg-primary"
          />

          {/* Cover */}
          <div className="absolute h-44 w-full -translate-y-[12.5rem] bg-background" />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

// =============================================================================
// ANIMATED TITLE COMPONENT
// =============================================================================
const AnimatedTitle = () => {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ["analyze", "explore", "learn", "master", "profit"],
    []
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber(titleNumber === titles.length - 1 ? 0 : titleNumber + 1);
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  return (
    <span className="relative flex w-full justify-center overflow-hidden h-[1.2em]">
      {titles.map((title, index) => (
        <motion.span
          key={index}
          className="absolute font-bold text-primary"
          initial={{ opacity: 0, y: 50 }}
          animate={
            titleNumber === index
              ? { y: 0, opacity: 1 }
              : { y: titleNumber > index ? -50 : 50, opacity: 0 }
          }
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          {title}
        </motion.span>
      ))}
    </span>
  );
};

// =============================================================================
// GLOW CARD COMPONENT
// =============================================================================
const GlowCard = ({ 
  icon: Icon, 
  title, 
  description,
  delay = 0 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  delay?: number;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
      className="group relative"
    >
      {/* Glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-0 group-hover:opacity-40 transition duration-500" />
      
      {/* Card */}
      <div className={cn(
        "relative h-full p-6 rounded-2xl",
        "bg-card/80 backdrop-blur-sm",
        "border border-border/50 hover:border-primary/30",
        "transition-all duration-300"
      )}>
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        
        {/* Content */}
        <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        
        {/* Soon badge */}
        <Badge variant="secondary" className="absolute top-4 right-4 text-xs">
          Soon
        </Badge>
      </div>
    </motion.div>
  );
};

// =============================================================================
// FEATURES DATA
// =============================================================================
const features = [
  {
    icon: Search,
    title: "Token Analysis",
    description: "Deep dive into token metrics, holder distribution, liquidity analysis, and smart contract verification."
  },
  {
    icon: Wallet,
    title: "Wallet Explorer",
    description: "Track any wallet's portfolio, transaction history, PnL analysis, and trading patterns."
  },
  {
    icon: Shield,
    title: "Security Scanner",
    description: "Automated rug-pull detection, honeypot checks, and contract security audits."
  },
  {
    icon: Activity,
    title: "Real-time Alerts",
    description: "Get notified on price movements, whale transactions, and market anomalies."
  },
  {
    icon: BookOpen,
    title: "Trading Academy",
    description: "Learn strategies, risk management, technical analysis, and market psychology."
  },
  {
    icon: BarChart3,
    title: "Pro Charts",
    description: "Professional-grade charting with 50+ indicators, drawing tools, and multi-timeframe analysis."
  },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function TokenAnalyzer() {
  return (
    <LampBackground>
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            {/* Badge */}
            <Badge className="mb-6 px-4 py-2 text-sm bg-primary/10 border-primary/30">
              <Sparkles className="w-3 h-3 mr-2" />
              Coming Soon
            </Badge>

            {/* Animated Title */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 tracking-tight">
              <span className="text-foreground">Learn to</span>
              <br />
              <AnimatedTitle />
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              Master memecoin trading with advanced analytics, educational resources, 
              and real-time blockchain insights powered by Helius.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gap-2 rounded-full px-8"
                onClick={() => window.open('https://x.com/simikiapp', '_blank')}
              >
                <SiX className="h-4 w-4" />
                Follow for Updates
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="gap-2 rounded-full px-8"
                onClick={() => window.location.href = '/'}
              >
                Start Trading
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Powerful Tools Coming
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Everything you need to become a smarter trader
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <GlowCard
                key={index}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={index * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              { icon: Zap, title: "Helius Powered", desc: "Real-time Solana data" },
              { icon: Target, title: "Pro Analysis", desc: "Advanced trading tools" },
              { icon: GraduationCap, title: "Learn & Earn", desc: "Educational content" },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 px-4 border-t border-border/50">
        <div className="container mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-2xl font-bold mb-4">
              Be the First to Know
            </h3>
            <p className="text-muted-foreground mb-6">
              Follow us on X to get early access when Study launches
            </p>
            <a
              href="https://x.com/simikiapp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background font-semibold hover:bg-foreground/90 transition-colors"
            >
              <SiX className="h-4 w-4" />
              @simikiapp
            </a>
          </motion.div>
        </div>
      </section>
    </LampBackground>
  );
}
