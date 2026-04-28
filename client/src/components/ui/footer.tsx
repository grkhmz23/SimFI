import { useState, useEffect } from "react"
import { Link } from "wouter"
import { cn } from "@/lib/utils"
import { SiX } from "react-icons/si"
import { FaTelegram } from "react-icons/fa"
import { Users } from "lucide-react"

export function Footer({ className }: { className?: string }) {
  const [status, setStatus] = useState<"healthy" | "unhealthy" | "loading">("loading")

  useEffect(() => {
    let cancelled = false
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setStatus(data.status === "healthy" ? "healthy" : "unhealthy")
      })
      .catch(() => {
        if (!cancelled) setStatus("unhealthy")
      })
    return () => { cancelled = true }
  }, [])

  return (
    <footer
      className={cn(
        "border-t border-[var(--border-subtle)] bg-[var(--bg-base)]",
        className
      )}
    >
      <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/simfi-logo.png" alt="SimFi" className="h-8 w-auto opacity-70" />
            <span className="text-sm text-[var(--text-tertiary)]">
              © {new Date().getFullYear()} SimFi
            </span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/about" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
              About
            </Link>
            <Link href="/leaderboard" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
              Leaderboard
            </Link>
            <a
              href="https://x.com/sim__fi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors inline-flex items-center gap-1.5"
              aria-label="SimFi on X"
            >
              <SiX className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">X</span>
            </a>
            <a
              href="https://x.com/i/communities/1981329893569835367"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors inline-flex items-center gap-1.5"
              aria-label="SimFi X Community"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Community</span>
            </a>
            <a
              href="https://t.me/sim_fi_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors inline-flex items-center gap-1.5"
              aria-label="SimFi Telegram Bot"
            >
              <FaTelegram className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bot</span>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status === "healthy"
                  ? "bg-[var(--accent-gain)]"
                  : status === "unhealthy"
                  ? "bg-[var(--accent-loss)]"
                  : "bg-[var(--text-tertiary)]"
              )}
            />
            <span className="text-xs text-[var(--text-tertiary)] capitalize">
              {status === "loading" ? "Checking..." : status}
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
