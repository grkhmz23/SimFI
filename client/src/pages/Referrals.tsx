import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, Users, UserCheck, Gift } from "lucide-react";

interface ReferralStats {
  username: string;
  referralLink: string;
  total: number;
  converted: number;
  pending: number;
}

export default function Referrals() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/referrals/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const copyLink = () => {
    if (!stats) return;
    navigator.clipboard.writeText(stats.referralLink);
    toast({ title: "Copied!", description: "Referral link copied to clipboard." });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Referrals</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Referred</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Users className="h-6 w-6 text-blue-500" />
            <span className="text-3xl font-bold">{stats?.total || 0}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Converted</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <UserCheck className="h-6 w-6 text-green-500" />
            <span className="text-3xl font-bold">{stats?.converted || 0}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Rewards</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Gift className="h-6 w-6 text-amber-500" />
            <span className="text-3xl font-bold">{stats?.pending || 0}</span>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Your Referral Link</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input readOnly value={stats?.referralLink || ""} className="bg-muted" />
            <Button onClick={copyLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Share your link. Friends get <strong>+1 ETH</strong> starter bonus. You get{" "}
            <strong>+0.5 ETH</strong> when they complete their first trade.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
