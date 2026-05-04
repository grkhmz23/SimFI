import { useLocation } from "wouter"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"
import {
  TrendingUp,
  BarChart3,
  Trophy,
  Wallet,
  User,
  Bookmark,
  Brain,
} from "lucide-react"

export function MobileNav() {
  const [location, setLocation] = useLocation()
  const { isAuthenticated } = useAuth()

  const tabs = [
    { path: "/", label: "Trade", icon: TrendingUp },
    { path: "/trending", label: "Trending", icon: BarChart3 },
    { path: "/predictions", label: "Predict", icon: Brain },
    ...(isAuthenticated ? [
      { path: "/portfolio", label: "Portfolio", icon: Wallet },
      { path: "/watchlist", label: "Watch", icon: Bookmark },
    ] : []),
    { path: "/leaderboard", label: "Ranks", icon: Trophy },
    { path: isAuthenticated ? "/dashboard" : "/login", label: isAuthenticated ? "Profile" : "Login", icon: User },
  ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-overlay)] backdrop-blur-xl border-t border-[var(--border-subtle)]">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const active = location === tab.path
          return (
            <button
              key={tab.path}
              onClick={() => setLocation(tab.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors",
                active
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)]"
              )}
            >
              <tab.icon
                className={cn("h-[18px] w-[18px]", active && "stroke-[2px]")}
                strokeWidth={active ? 2 : 1.5}
              />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
