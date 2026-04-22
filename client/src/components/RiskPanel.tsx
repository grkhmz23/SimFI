import { AlertTriangle, Droplets, Clock, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenRiskData {
  liquidity?: number;
  volume24h?: number;
  pairCreatedAt?: number;
  marketCap?: number;
}

interface RiskWarning {
  level: "high" | "medium" | "low";
  icon: React.ReactNode;
  title: string;
  message: string;
}

export function RiskPanel({ data }: { data: TokenRiskData }) {
  const warnings: RiskWarning[] = [];

  const liquidity = data.liquidity || 0;
  const volume24h = data.volume24h || 0;
  const pairCreatedAt = data.pairCreatedAt || 0;
  const marketCap = data.marketCap || 0;
  const ageHours = pairCreatedAt > 0 ? (Date.now() - pairCreatedAt) / (1000 * 60 * 60) : Infinity;

  // High risk: extremely low liquidity
  if (liquidity > 0 && liquidity < 50_000) {
    warnings.push({
      level: "high",
      icon: <Droplets className="h-4 w-4" strokeWidth={1.5} />,
      title: "Low Liquidity",
      message: `Only $${(liquidity / 1000).toFixed(1)}K liquidity. Trades may cause significant price impact and slippage.`,
    });
  } else if (liquidity > 0 && liquidity < 200_000) {
    warnings.push({
      level: "medium",
      icon: <Droplets className="h-4 w-4" strokeWidth={1.5} />,
      title: "Limited Liquidity",
      message: `$${(liquidity / 1000).toFixed(0)}K liquidity — larger trades may face slippage.`,
    });
  }

  // Medium risk: thin volume
  if (volume24h > 0 && volume24h < 10_000) {
    warnings.push({
      level: "medium",
      icon: <Activity className="h-4 w-4" strokeWidth={1.5} />,
      title: "Low Volume",
      message: `Only $${(volume24h / 1000).toFixed(1)}K traded in 24h. May be difficult to exit positions.`,
    });
  }

  // High risk: very new token
  if (ageHours < 24) {
    warnings.push({
      level: "high",
      icon: <Clock className="h-4 w-4" strokeWidth={1.5} />,
      title: "Brand New Token",
      message: `Created ${ageHours < 1 ? "< 1 hour" : `${Math.floor(ageHours)} hours`} ago. High risk of rug pulls and extreme volatility.`,
    });
  } else if (ageHours < 72) {
    warnings.push({
      level: "medium",
      icon: <Clock className="h-4 w-4" strokeWidth={1.5} />,
      title: "Very New Token",
      message: `Created ${Math.floor(ageHours)} hours ago. New tokens are inherently risky.`,
    });
  }

  // High risk: zero or missing metrics
  if (marketCap === 0 && liquidity === 0) {
    warnings.push({
      level: "high",
      icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />,
      title: "Unverified Token",
      message: "No market data available. This token may not be actively traded on any DEX.",
    });
  }

  if (warnings.length === 0) {
    return null;
  }

  const highCount = warnings.filter((w) => w.level === "high").length;

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] overflow-hidden">
      <div className={cn(
        "px-4 py-2.5 flex items-center gap-2 text-sm font-medium",
        highCount > 0
          ? "bg-[var(--accent-loss)]/10 text-[var(--accent-loss)]"
          : "bg-[var(--accent-premium)]/10 text-[var(--accent-premium)]"
      )}>
        <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
        {highCount > 0
          ? `${highCount} high-risk signal${highCount > 1 ? "s" : ""} detected`
          : `${warnings.length} caution${warnings.length > 1 ? "s" : ""}`}
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {warnings.map((warning, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            <span className={cn(
              "mt-0.5 shrink-0",
              warning.level === "high"
                ? "text-[var(--accent-loss)]"
                : "text-[var(--accent-premium)]"
            )}>
              {warning.icon}
            </span>
            <div>
              <p className={cn(
                "text-sm font-medium",
                warning.level === "high"
                  ? "text-[var(--accent-loss)]"
                  : "text-[var(--text-primary)]"
              )}>
                {warning.title}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {warning.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
