import { useState, useEffect } from 'react';
import { X, Sparkles, TrendingUp, Trophy, Zap, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

interface WelcomePopupProps {
  storageKey?: string;
  delay?: number;
  showOncePerSession?: boolean;
}

export function WelcomePopup({
  storageKey = 'simfi-welcome-popup-seen',
  delay = 800,
  showOncePerSession = false, // Changed to false so it uses localStorage by default
}: WelcomePopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const storage = showOncePerSession ? sessionStorage : localStorage;
    const hasSeen = storage.getItem(storageKey);

    if (!hasSeen) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [storageKey, delay, showOncePerSession]);

  const handleClose = () => {
    setIsOpen(false);
    const storage = showOncePerSession ? sessionStorage : localStorage;
    storage.setItem(storageKey, 'true');
  };

  const handleGetStarted = () => {
    handleClose();
    setLocation('/register');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md"
            onClick={handleClose}
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="relative pointer-events-auto max-w-md w-full">
              {/* Animated glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary via-accent to-primary rounded-3xl blur-xl opacity-60 animate-pulse" />
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-3xl opacity-30" />

              {/* Main container */}
              <div className="relative bg-card border border-border/50 rounded-3xl overflow-hidden shadow-2xl">
                {/* Close button */}
                <button
                  onClick={handleClose}
                  className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-background/50 backdrop-blur-sm text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-200 group"
                  aria-label="Close popup"
                >
                  <X className="h-4 w-4 group-hover:rotate-90 transition-transform duration-200" />
                </button>

                {/* Header with gradient */}
                <div className="relative px-8 pt-8 pb-6 bg-gradient-to-b from-primary/10 to-transparent">
                  {/* Logo */}
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg" />
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
                    <div>
                      <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        SimFi
                      </h2>
                      <p className="text-xs text-muted-foreground">Paper Trading Platform</p>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-semibold text-center text-foreground">
                    Welcome to SimFi! 🚀
                  </h3>
                </div>

                {/* Content */}
                <div className="px-8 pb-8">
                  <p className="text-center text-muted-foreground mb-6">
                    Practice trading Base and Solana memecoins risk-free with 5 ETH + 10 SOL paper balance
                  </p>

                  {/* Features */}
                  <div className="space-y-3 mb-6">
                    {[
                      { icon: Zap, text: "Real-time prices from live DEX data", color: "text-yellow-500" },
                      { icon: Trophy, text: "Compete on the global leaderboard", color: "text-primary" },
                      { icon: Sparkles, text: "Track your portfolio in real-time", color: "text-accent" },
                    ].map((feature, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + index * 0.1 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-muted/50"
                      >
                        <div className={`w-8 h-8 rounded-lg bg-background flex items-center justify-center ${feature.color}`}>
                          <feature.icon className="w-4 h-4" />
                        </div>
                        <span className="text-sm text-foreground">{feature.text}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* CTA Buttons */}
                  <div className="space-y-3">
                    <Button
                      onClick={handleGetStarted}
                      className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg shadow-primary/25 group"
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                    <Button
                      onClick={handleClose}
                      variant="ghost"
                      className="w-full h-10 text-sm text-muted-foreground hover:text-foreground"
                    >
                      I'll explore first
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default WelcomePopup;