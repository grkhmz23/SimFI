import { useState, useEffect } from "react"
import { Link, useLocation } from "wouter"
import { useAuth } from "@/lib/auth-context"
import { useChain } from "@/lib/chain-context"
import { usePrice } from "@/lib/price-context"
import { useSsePrices } from "@/hooks/useSsePrices"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CommandSearch } from "@/components/CommandSearch"
import {
  User,
  LogOut,
  Wallet,
  History,
  Users,
  ChevronDown,
  Bookmark,
  PieChart,
  Shield,
  Gift,
  Brain,
  BarChart3,
} from "lucide-react"
import { FaTelegram } from "react-icons/fa"
import { formatBalance, formatUSD } from "@/lib/token-format"
import { cn } from "@/lib/utils"

const logoUrl = "/simfi-logo.png"

export function Navigation() {
  const [location, setLocation] = useLocation()
  const { user, logout, isAuthenticated, getBalance } = useAuth()
  const { activeChain, setActiveChain, nativeSymbol } = useChain()
  const { getPrice } = usePrice()
  const { isConnected, useFallback } = useSsePrices()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const navItems = [
    { path: "/trade", label: "Trade" },
    { path: "/trending", label: "Trending" },
    { path: "/predictions", label: "Predictions" },
    { path: "/alpha-desk", label: "Alpha Desk" },
    { path: "/leaderboard", label: "Leaderboard" },
    { path: "/about", label: "About" },
  ]

  const isActive = (path: string) => {
    if (path === "/predictions") return location.startsWith("/predictions");
    return location === path;
  }

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-200",
          scrolled
            ? "bg-[var(--bg-overlay)] backdrop-blur-xl border-b border-[var(--border-subtle)]"
            : "bg-transparent"
        )}
      >
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            {/* Wordmark */}
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <img src={logoUrl} alt="SimFi" className="h-10 w-auto" />
              <span className="font-serif text-xl tracking-tight text-[var(--text-primary)] hidden sm:block">
                SimFi
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => setLocation(item.path)}
                  className={cn(
                    "relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                    isActive(item.path)
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.03)]"
                  )}
                >
                  {item.label}
                  {isActive(item.path) && (
                    <span className="absolute inset-x-1 -bottom-[9px] h-px bg-[var(--text-primary)]" />
                  )}
                </button>
              ))}
            </nav>

            {/* Center: Search */}
            <div className="flex-1 flex justify-center max-w-md">
              <CommandSearch />
            </div>

            {/* Right: Chain + Auth */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Live indicator */}
              <div className="hidden sm:flex items-center" title={isConnected ? "Live prices via SSE" : useFallback ? "Polling mode" : "Connecting..."}>
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isConnected
                      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                      : useFallback
                        ? "bg-amber-400"
                        : "bg-[var(--text-tertiary)] animate-pulse"
                  )}
                />
              </div>

              {/* Chain Toggle */}
              <div className="hidden sm:flex items-center rounded-md bg-[hsl(240_4%_12%)] border border-[var(--border-subtle)] p-0.5">
                <button
                  onClick={() => setActiveChain("base")}
                  className={cn(
                    "px-2.5 py-1 rounded-sm text-xs font-medium transition-all",
                    activeChain === "base"
                      ? "bg-[var(--bg-raised)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  )}
                >
                  Base
                </button>
                <button
                  onClick={() => setActiveChain("solana")}
                  className={cn(
                    "px-2.5 py-1 rounded-sm text-xs font-medium transition-all",
                    activeChain === "solana"
                      ? "bg-[var(--bg-raised)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  )}
                >
                  Solana
                </button>
              </div>

              {/* Telegram Bot */}
              <a
                href="https://t.me/sim_fi_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex items-center justify-center h-9 w-9 rounded-md text-[var(--text-secondary)] bg-[hsl(240_4%_12%)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
                title="Trade on Telegram"
                aria-label="Trade on Telegram"
              >
                <FaTelegram className="h-4 w-4 text-sky-400" />
              </a>

              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[var(--border-strong)] transition-colors">
                      <div className="h-7 w-7 rounded-full bg-[var(--bg-base)] flex items-center justify-center border border-[var(--border-subtle)]">
                        <User className="h-3.5 w-3.5 text-[var(--text-secondary)]" strokeWidth={1.5} />
                      </div>
                      <div className="hidden md:flex flex-col items-start leading-none">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {user?.username}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)] tabular-nums mt-0.5">
                          {formatBalance(getBalance(activeChain), activeChain, 3)} {nativeSymbol}
                        </span>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 text-[var(--text-tertiary)] hidden md:block" strokeWidth={1.5} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{user?.username}</span>
                        <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                          {formatBalance(getBalance(activeChain), activeChain, 4)} {nativeSymbol}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums">
                          ≈ {formatUSD(getBalance(activeChain), getPrice(activeChain), activeChain)}
                        </span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLocation("/portfolio")}>
                      <Wallet className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Portfolio
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/predictions/me")}>
                      <Brain className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Predictions
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/positions")}>
                      <BarChart3 className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Positions
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/history")}>
                      <History className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      History
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/watchlist")}>
                      <Bookmark className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Watchlist
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/analytics")}>
                      <PieChart className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Analytics
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/referrals")}>
                      <Users className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Referrals
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/rewards")}>
                      <Gift className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Rewards
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/security")}>
                      <Shield className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Security
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-[var(--accent-loss)] focus:text-[var(--accent-loss)]">
                      <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation("/login")}
                  >
                    Login
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setLocation("/register")}
                  >
                    Get Started
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-14" />
    </>
  )
}
