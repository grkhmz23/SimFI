// client/src/pages/TokenAnalyzer.tsx
// Study Section - Coming Soon with Lamp Effect

import { motion } from 'framer-motion';
import { LampContainer } from '@/components/ui/lamp';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Wallet, 
  Activity, 
  BarChart3, 
  Shield, 
  Zap,
  BookOpen,
  TrendingUp,
  Clock
} from 'lucide-react';

const features = [
  {
    icon: Search,
    title: "Token Analysis",
    description: "Deep dive into token metrics, holder distribution, and security audits",
    status: "coming"
  },
  {
    icon: Wallet,
    title: "Wallet Explorer",
    description: "Comprehensive portfolio analytics and transaction history",
    status: "coming"
  },
  {
    icon: Activity,
    title: "Real-time Monitoring",
    description: "Live blockchain data and price alerts",
    status: "coming"
  },
  {
    icon: Shield,
    title: "Security Scanner",
    description: "Automated rug-pull detection and contract analysis",
    status: "coming"
  },
  {
    icon: BookOpen,
    title: "Trading Academy",
    description: "Learn strategies, risk management, and market analysis",
    status: "coming"
  },
  {
    icon: BarChart3,
    title: "Advanced Charts",
    description: "Professional-grade charting with indicators",
    status: "coming"
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.3 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
  }
};

export default function TokenAnalyzer() {
  return (
    <div className="min-h-screen bg-background">
      {/* Lamp Hero Section */}
      <LampContainer className="min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.3,
            duration: 0.8,
            ease: "easeInOut",
          }}
          className="text-center"
        >
          <Badge className="mb-4 px-4 py-2 text-sm bg-primary/10 border-primary/30">
            <Clock className="w-3 h-3 mr-2" />
            Coming Soon
          </Badge>
          
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-br from-foreground via-foreground/80 to-muted-foreground bg-clip-text text-transparent pb-2">
            Study
          </h1>
          
          <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Master the art of memecoin trading with advanced analytics, 
            educational resources, and real-time blockchain insights
          </p>
        </motion.div>
      </LampContainer>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              What's Coming
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Powerful tools to help you make smarter trading decisions
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {features.map((feature, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="group relative h-full p-6 bg-card hover:bg-card/80 border-border hover:border-primary/30 transition-all duration-300 overflow-hidden">
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{feature.title}</h3>
                      <Badge variant="secondary" className="text-xs">
                        Soon
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Stats/Info Section */}
      <section className="py-16 px-4 border-t border-border">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Powered by Helius</h3>
              <p className="text-sm text-muted-foreground">
                Real-time Solana blockchain data and analytics
              </p>
            </div>
            
            <div>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Pro-Level Tools</h3>
              <p className="text-sm text-muted-foreground">
                Advanced charting and analysis features
              </p>
            </div>
            
            <div>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Learn & Earn</h3>
              <p className="text-sm text-muted-foreground">
                Educational content to improve your skills
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-12 px-4 bg-card/50">
        <div className="container mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-2xl font-bold mb-4">Stay Updated</h3>
            <p className="text-muted-foreground mb-6">
              Follow us on X to be the first to know when Study launches
            </p>
            <a
              href="https://x.com/simikiapp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Follow @simikiapp
            </a>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
