import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";

interface Referrer {
  id: string;
  username: string;
  totalReferrals: number;
  convertedReferrals: number;
  rank: number;
}

export function ReferralLeaderboard() {
  const [leaders, setLeaders] = useState<Referrer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/referrals/leaderboard")
      .then((r) => r.json())
      .then((data) => {
        setLeaders(data.leaders || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Referrers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Top Referrers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {leaders.map((leader) => (
            <div
              key={leader.id}
              className="flex items-center justify-between rounded-lg border bg-card/50 p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    leader.rank === 1
                      ? "bg-yellow-500/20 text-yellow-500"
                      : leader.rank === 2
                      ? "bg-slate-300/20 text-slate-300"
                      : leader.rank === 3
                      ? "bg-amber-600/20 text-amber-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {leader.rank}
                </span>
                <span className="font-medium">@{leader.username}</span>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold">{leader.totalReferrals} refs</div>
                <div className="text-xs text-muted-foreground">
                  {leader.convertedReferrals || 0} converted
                </div>
              </div>
            </div>
          ))}
          {leaders.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">No referrals yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
