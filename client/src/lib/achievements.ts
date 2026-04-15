import type { BadgeId } from "@shared/schema";

export interface BadgeMeta {
  id: BadgeId;
  name: string;
  description: string;
  icon: string;
  color: string;
  ringColor: string;
}

export const BADGE_METADATA: Record<BadgeId, BadgeMeta> = {
  first_trade: {
    id: "first_trade",
    name: "First Trade",
    description: "Complete your first trade",
    icon: "🎯",
    color: "#3b82f6",
    ringColor: "ring-blue-500",
  },
  base_beginner: {
    id: "base_beginner",
    name: "Base Beginner",
    description: "Complete 5 trades on Base",
    icon: "🔵",
    color: "#0052ff",
    ringColor: "ring-blue-600",
  },
  solana_veteran: {
    id: "solana_veteran",
    name: "Solana Veteran",
    description: "Complete 5 trades on Solana",
    icon: "🟣",
    color: "#a855f7",
    ringColor: "ring-purple-500",
  },
  green_day: {
    id: "green_day",
    name: "Green Day",
    description: "Close a day with positive total PnL",
    icon: "📈",
    color: "#22c55e",
    ringColor: "ring-green-500",
  },
  top_10: {
    id: "top_10",
    name: "Top 10",
    description: "Reach top 10 on any leaderboard period",
    icon: "🏆",
    color: "#eab308",
    ringColor: "ring-yellow-500",
  },
  diamond_hands: {
    id: "diamond_hands",
    name: "Diamond Hands",
    description: "Hold a position for over 24 hours",
    icon: "💎",
    color: "#06b6d4",
    ringColor: "ring-cyan-500",
  },
  profit_1eth: {
    id: "profit_1eth",
    name: "ETH Profit Club",
    description: "Make over 1 ETH realized profit on Base",
    icon: "🦄",
    color: "#f59e0b",
    ringColor: "ring-amber-500",
  },
  profit_10sol: {
    id: "profit_10sol",
    name: "SOL Profit Club",
    description: "Make over 10 SOL realized profit on Solana",
    icon: "☀️",
    color: "#f97316",
    ringColor: "ring-orange-500",
  },
};

export const ALL_BADGE_IDS: BadgeId[] = Object.keys(BADGE_METADATA) as BadgeId[];
