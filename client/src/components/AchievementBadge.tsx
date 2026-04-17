import { BADGE_METADATA } from "@/lib/achievements";
import type { BadgeId } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Target, Circle, TrendingUp, Trophy, Gem, Sparkles, Sun } from "lucide-react";

interface AchievementBadgeProps {
  badgeId: BadgeId;
  unlocked?: boolean;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
}

const ICON_MAP = {
  target: Target,
  circle: Circle,
  "trending-up": TrendingUp,
  trophy: Trophy,
  gem: Gem,
  sparkles: Sparkles,
  sun: Sun,
};

export function AchievementBadge({
  badgeId,
  unlocked = true,
  size = "md",
}: AchievementBadgeProps) {
  const meta = BADGE_METADATA[badgeId];
  if (!meta) return null;

  const Icon = ICON_MAP[meta.icon];

  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
  };

  const iconSizes = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  const ringClasses = {
    sm: "ring-2",
    md: "ring-[3px]",
    lg: "ring-4",
  };

  return (
    <div className="group relative flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-card shadow-lg transition-all duration-300",
          sizeClasses[size],
          ringClasses[size],
          meta.ringColor,
          unlocked ? "opacity-100 scale-100" : "opacity-30 grayscale scale-95"
        )}
        style={{
          boxShadow: unlocked ? `0 0 20px ${meta.color}30` : undefined,
        }}
      >
        {Icon && <Icon size={iconSizes[size]} style={{ color: meta.color }} />}
      </div>
      <span
        className={cn(
          "text-center text-xs font-medium transition-colors",
          unlocked ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {meta.name}
      </span>

      {/* Tooltip */}
      <div className="absolute bottom-full mb-2 hidden w-40 rounded-lg border bg-popover p-2 text-xs text-popover-foreground shadow-xl group-hover:block z-50">
        <p className="font-semibold">{meta.name}</p>
        <p className="text-muted-foreground">{meta.description}</p>
        {!unlocked && <p className="mt-1 text-destructive">Locked</p>}
      </div>
    </div>
  );
}
