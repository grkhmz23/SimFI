import React, { useState, type FC, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Facebook, Instagram, Twitter } from 'lucide-react';

interface FooterProps extends React.HTMLAttributes<HTMLElement> {
  logoSrc?: string;
  companyName?: string;
  description?: string;
  usefulLinks?: { label: string; href: string }[];
  socialLinks?: { label: string; href: string; icon: ReactNode }[];
  newsletterTitle?: string;
  onSubscribe?: (email: string) => Promise<boolean>;
}

export const Footer: FC<FooterProps> = ({
  logoSrc = '/simfi-logo.png',
  companyName = 'SimFi',
  description = 'Practice trading Base and Solana memecoins risk-free. Master strategies, compete on leaderboards, and learn without losing real money.',
  usefulLinks = [
    { label: 'Trade', href: '/trade' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Portfolio', href: '/portfolio' },
    { label: 'About', href: '/about' },
  ],
  socialLinks = [
    { label: 'X Community', href: 'https://x.com/i/communities/1981329893569835367', icon: <Twitter className="h-5 w-5" /> },
  ],
  newsletterTitle = 'Stay Updated',
  onSubscribe,
  className,
  ...props
}) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !onSubscribe || isSubmitting) return;

    setIsSubmitting(true);
    const success = await onSubscribe(email);

    setSubscriptionStatus(success ? 'success' : 'error');
    setIsSubmitting(false);

    if (success) {
      setEmail('');
    }

    setTimeout(() => {
      setSubscriptionStatus('idle');
    }, 3000);
  };

  return (
    <footer className={cn('bg-card/50 border-t border-border text-foreground', className)} {...props}>
      <div className="container mx-auto grid grid-cols-1 gap-8 px-4 py-16 md:grid-cols-2 lg:grid-cols-4 lg:gap-12">
        {/* Company Info */}
        <div className="flex flex-col items-start gap-4">
          <div className="flex items-center gap-3">
            <img 
              src={logoSrc} 
              alt={`${companyName} Logo`} 
              className="h-10 w-10 object-contain" 
            />
            <span className="text-xl font-bold gradient-simfi-text">{companyName}</span>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Useful Links */}
        <div className="md:justify-self-center">
          <h3 className="mb-4 text-base font-semibold">Quick Links</h3>
          <ul className="space-y-2">
            {usefulLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Follow Us */}
        <div className="md:justify-self-center">
          <h3 className="mb-4 text-base font-semibold">Follow Us</h3>
          <ul className="space-y-2">
            {socialLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {link.icon}
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Newsletter */}
        {onSubscribe && (
          <div>
            <h3 className="mb-4 text-base font-semibold">{newsletterTitle}</h3>
            <form onSubmit={handleSubscribe} className="relative w-full max-w-sm">
              <div className="relative">
                <Input
                  type="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting || subscriptionStatus !== 'idle'}
                  required
                  aria-label="Email for newsletter"
                  className="pr-28 bg-background/50"
                />
                <Button
                  type="submit"
                  disabled={isSubmitting || subscriptionStatus !== 'idle'}
                  className="absolute right-0 top-0 h-full rounded-l-none px-4"
                >
                  {isSubmitting ? 'Subscribing...' : 'Subscribe'}
                </Button>
              </div>
              {(subscriptionStatus === 'success' || subscriptionStatus === 'error') && (
                <div
                  className="animate-in fade-in absolute inset-0 flex items-center justify-center rounded-lg bg-background/80 text-center backdrop-blur-sm"
                >
                  {subscriptionStatus === 'success' ? (
                    <span className="font-semibold text-green-500">Subscribed!</span>
                  ) : (
                    <span className="font-semibold text-destructive">Failed. Try again.</span>
                  )}
                </div>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border py-6">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {companyName}. Educational trading platform.</p>
          <p>No real money involved. Practice safely.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;