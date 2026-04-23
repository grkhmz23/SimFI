import { useState, useEffect } from 'react';
import { X, ArrowRight, BarChart3, Shield, Coins } from 'lucide-react';
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
  showOncePerSession = false,
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="relative pointer-events-auto max-w-md w-full">
              <div className="relative bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
                <button
                  onClick={handleClose}
                  className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close popup"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="px-8 pt-8 pb-6 border-b border-border/50">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <img
                      src="/simfi-logo.png"
                      alt="SimFi Logo"
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                    <div>
                      <h2 className="text-xl font-semibold text-foreground tracking-tight">SimFi</h2>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Paper Trading</p>
                    </div>
                  </div>

                  <h3 className="text-lg font-medium text-center text-foreground">
                    Welcome to SimFi
                  </h3>
                </div>

                <div className="px-8 pb-8 pt-6">
                  <p className="text-center text-muted-foreground mb-6 text-sm">
                    Practice trading Base and Solana tokens with 5 ETH + 10 SOL in paper balance. Real market data, zero risk.
                  </p>

                  <div className="space-y-2 mb-6">
                    {[
                      { icon: BarChart3, text: "Real-time DEX prices and charts" },
                      { icon: Shield, text: "Risk-free paper trading environment" },
                      { icon: Coins, text: "Track portfolio performance live" },
                    ].map((feature, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center text-primary">
                          <feature.icon className="w-4 h-4" />
                        </div>
                        <span className="text-sm text-foreground">{feature.text}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <Button
                      onClick={handleGetStarted}
                      className="w-full h-11 text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                      onClick={handleClose}
                      variant="ghost"
                      className="w-full h-10 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Explore First
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
