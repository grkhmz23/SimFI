import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AchievementBadge } from "@/components/AchievementBadge";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { BadgeId, Trade, Chain } from "@shared/schema";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface TraderProfileData {
  trader: {
    id: string;
    username: string;
    createdAt: string;
    solanaWalletAddress: string | null;
    baseWalletAddress: string | null;
    balance: string;
    baseBalance: string;
    totalProfit: string;
    baseTotalProfit: string;
    winRate: number;
    avgHoldTimeSeconds: number;
    followerCount: number;
    isFollowing: boolean;
    achievements: BadgeId[];
  };
}

export default function TraderProfile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<TraderProfileData["trader"] | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const isMe = user?.username === username;

  useEffect(() => {
    if (!username) return;
    Promise.all([
      fetch(`/api/traders/${username}`).then((r) => r.json()),
      fetch(`/api/traders/${username}/trades`).then((r) => r.json()),
    ])
      .then(([profileData, tradesData]) => {
        setProfile(profileData.trader || null);
        setTrades(tradesData.trades || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [username]);

  const toggleFollow = async () => {
    const res = await fetch(`/api/traders/${username}/follow`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json();
    if (res.ok && profile) {
      setProfile({
        ...profile,
        isFollowing: data.following,
        followerCount: profile.followerCount + (data.following ? 1 : -1),
      });
      toast({
        title: data.following ? "Following" : "Unfollowed",
        description: data.following ? `You are now following @${username}` : `Unfollowed @${username}`,
      });
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Trader not found</h1>
        <p className="text-muted-foreground">@{username} doesn&apos;t exist.</p>
      </div>
    );
  }

  const formatHoldTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/leaderboard">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </Link>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">@{profile.username}</h1>
            <p className="text-sm text-muted-foreground">
              Member since {new Date(profile.createdAt).toLocaleDateString()}
            </p>
          </div>
          {!isMe && isAuthenticated && (
            <Button onClick={toggleFollow} variant={profile.isFollowing ? "outline" : "default"}>
              {profile.isFollowing ? "Unfollow" : "Follow"}
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Win Rate" value={`${profile.winRate}%`} />
          <StatCard label="Avg Hold" value={formatHoldTime(profile.avgHoldTimeSeconds)} />
          <StatCard label="Followers" value={profile.followerCount.toString()} />
          <StatCard label="Total Profit" value={`+${Number(profile.baseTotalProfit) / 1e18 || Number(profile.totalProfit) / 1e9}`} />
        </div>
      </div>

      {/* Badges */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Achievement Badges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {profile.achievements.map((badgeId) => (
              <AchievementBadge key={badgeId} badgeId={badgeId} unlocked />
            ))}
            {profile.achievements.length === 0 && (
              <p className="text-sm text-muted-foreground">No badges unlocked yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {trades.slice(0, 10).map((trade) => (
              <div
                key={trade.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={trade.profitLoss >= 0 ? "default" : "destructive"}>
                    {trade.profitLoss >= 0 ? "+" : ""}
                    {Number(trade.profitLoss) / (trade.chain === "base" ? 1e18 : 1e9)}{" "}
                    {trade.chain === "base" ? "ETH" : "SOL"}
                  </Badge>
                  <span className="font-medium">${trade.tokenSymbol}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(trade.closedAt), { addSuffix: true })}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{trade.chain}</span>
              </div>
            ))}
            {trades.length === 0 && (
              <p className="text-sm text-muted-foreground">No trades yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
