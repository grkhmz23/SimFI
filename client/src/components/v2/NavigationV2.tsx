import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatNative } from "@/lib/token-format";
import { useChain } from "@/lib/chain-context";
import { TrendingUp, Microscope, Info, User, LogOut, Wallet, History, BarChart3 } from "lucide-react";
const logoUrl = '/simfi-logo.png';
import { OmniSearch } from "@/components/v2/OmniSearch";

const nav = [
  { path: "/", label: "Trade", icon: TrendingUp },
  { path: "/trending", label: "Trending", icon: TrendingUp },
  { path: "/study", label: "Study", icon: Microscope },
  { path: "/leaderboard", label: "Leaderboard", icon: BarChart3 },
  { path: "/about", label: "About", icon: Info },
];

export function NavigationV2() {
  const [location, setLocation] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const { activeChain, nativeSymbol } = useChain();
  
  const userBalance = activeChain === 'solana' ? user?.balance : user?.baseBalance;

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
        <div className="container mx-auto px-4">
          <div className="h-16 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 shrink-0" data-testid="v2-link-home">
              <img src={logoUrl} alt="SimFi" className="h-10 w-auto" />
            </Link>

            <nav className="hidden md:flex items-center gap-1 ml-2">
              {nav.map((item) => {
                const active = location === item.path;
                const Icon = item.icon;
                return (
                  <Button
                    key={item.path}
                    size="sm"
                    variant={active ? "secondary" : "ghost"}
                    className="gap-2 rounded-full"
                    onClick={() => setLocation(item.path)}
                    data-testid={`v2-nav-${item.label.toLowerCase()}`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <OmniSearch />

              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" className="gap-2 rounded-full" data-testid="v2-user-menu">
                      <User className="h-4 w-4" />
                      <span className="hidden sm:inline">{user?.username}</span>
                      <span className="hidden lg:inline font-mono text-xs text-muted-foreground">
                        {formatNative(userBalance || 0, activeChain)} {nativeSymbol}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span className="font-medium">{user?.username}</span>
                        <span className="font-mono text-xs text-muted-foreground font-normal">
                          {formatNative(userBalance || 0, activeChain)} {nativeSymbol}
                        </span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLocation("/portfolio")} data-testid="v2-menu-portfolio">
                      <Wallet className="mr-2 h-4 w-4" /> Portfolio
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/positions")} data-testid="v2-menu-positions">
                      <BarChart3 className="mr-2 h-4 w-4" /> Positions
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/history")} data-testid="v2-menu-history">
                      <History className="mr-2 h-4 w-4" /> History
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} data-testid="v2-menu-logout">
                      <LogOut className="mr-2 h-4 w-4" /> Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setLocation("/login")} data-testid="v2-login">
                    Login
                  </Button>
                  <Button variant="default" size="sm" className="rounded-full" onClick={() => setLocation("/register")} data-testid="v2-register">
                    Register
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="grid grid-cols-5">
          {nav.slice(0, 5).map((item) => {
            const active = location === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => setLocation(item.path)}
                className={`py-3 flex flex-col items-center justify-center text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}
                data-testid={`v2-bottom-${item.label.toLowerCase()}`}
              >
                <Icon className="h-5 w-5 mb-1" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
