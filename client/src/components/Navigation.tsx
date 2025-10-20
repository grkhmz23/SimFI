import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { TrendingUp, Home, BarChart3, History, Trophy, User, LogOut } from 'lucide-react';

export function Navigation() {
  const [location] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();

  const navItems = [
    { path: '/', label: 'Trade', icon: TrendingUp },
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/portfolio', label: 'Portfolio', icon: BarChart3 },
    { path: '/history', label: 'History', icon: History },
    { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  ];

  if (!isAuthenticated) return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/">
              <a className="flex items-center gap-2 text-xl font-bold text-primary hover-elevate rounded-md px-3 py-2" data-testid="link-home">
                <TrendingUp className="h-6 w-6" />
                <span className="hidden sm:inline">Pump.Fun Paper</span>
              </a>
            </Link>
            
            <div className="hidden md:flex gap-1">
              {navItems.map(item => (
                <Link key={item.path} href={item.path}>
                  <a data-testid={`link-${item.label.toLowerCase()}`}>
                    <Button
                      variant={location === item.path ? "secondary" : "ghost"}
                      size="sm"
                      className="gap-2"
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </a>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm text-muted-foreground">{user?.username}</span>
              <span className="font-mono text-sm font-semibold text-primary">
                {user?.balance.toFixed(4)} SOL
              </span>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              data-testid="button-logout"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Mobile navigation */}
        <div className="flex md:hidden gap-1 pb-2 overflow-x-auto">
          {navItems.map(item => (
            <Link key={item.path} href={item.path}>
              <a data-testid={`link-mobile-${item.label.toLowerCase()}`}>
                <Button
                  variant={location === item.path ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2 whitespace-nowrap"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </a>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
