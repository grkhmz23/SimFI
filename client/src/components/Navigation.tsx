import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TrendingUp, History, Trophy, User, LogOut, Wallet, Flame, Info } from 'lucide-react';
import { formatSol } from '@/lib/lamports';
import logoUrl from '@assets/Gemini_Generated_Image_b4urolb4urolb4ur_1761162361437.png';

export function Navigation() {
  const [location, setLocation] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();

  const navItems = [
    { path: '/', label: 'Trade', icon: TrendingUp },
    { path: '/trending', label: 'Trending', icon: Flame },
    { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { path: '/about', label: 'About', icon: Info },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-gradient-to-r from-primary/10 via-background to-chart-2/10 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <Link href="/" className="flex items-center gap-2 hover-elevate rounded-md px-2 py-1 shrink-0" data-testid="link-home">
              <img src={logoUrl} alt="SimFi Logo" className="h-14 w-auto" />
            </Link>
            
            <div className="hidden md:flex gap-1">
              {navItems.map(item => (
                <Button
                  key={item.path}
                  variant={location === item.path ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setLocation(item.path)}
                  data-testid={`link-${item.label.toLowerCase()}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                    <User className="h-5 w-5" />
                    <div className="hidden sm:flex flex-col items-start">
                      <span className="text-sm font-medium">{user?.username}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatSol(user?.balance || 0)} SOL
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user?.username}</span>
                      <span className="font-mono text-xs text-muted-foreground font-normal">
                        {formatSol(user?.balance || 0)} SOL
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation('/portfolio')} data-testid="menu-portfolio">
                    <Wallet className="mr-2 h-4 w-4" />
                    Portfolio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation('/history')} data-testid="menu-history">
                    <History className="mr-2 h-4 w-4" />
                    History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation('/login')}
                  data-testid="button-login"
                >
                  Login
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setLocation('/register')}
                  data-testid="button-register"
                >
                  Register
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile navigation */}
        <div className="flex md:hidden gap-1 pb-2 overflow-x-auto">
          {navItems.map(item => (
            <Button
              key={item.path}
              variant={location === item.path ? "secondary" : "ghost"}
              size="sm"
              className="gap-2 whitespace-nowrap"
              onClick={() => setLocation(item.path)}
              data-testid={`link-mobile-${item.label.toLowerCase()}`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    </nav>
  );
}
