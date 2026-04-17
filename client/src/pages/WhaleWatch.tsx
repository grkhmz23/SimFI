import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Chain } from "@shared/schema";

interface WhaleActivity {
  id: string;
  walletAddress: string;
  walletAlias: string;
  tokenAddress: string;
  tokenSymbol: string;
  action: "buy" | "sell";
  amountNative: number;
  timestamp: string;
  chain: Chain;
}

export default function WhaleWatch() {
  const [activity, setActivity] = useState<WhaleActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [chain, setChain] = useState<Chain>("base");

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/whales/activity?chain=${chain}`);
      const data = await res.json();
      setActivity(data.activity || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, [chain]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Whale Watch</h1>
          <p className="text-sm text-muted-foreground">
            Track smart money moves on {chain === "base" ? "Base" : "Solana"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-muted p-1">
            <button
              onClick={() => setChain("base")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                chain === "base" ? "bg-background text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Base
            </button>
            <button
              onClick={() => setChain("solana")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                chain === "solana" ? "bg-background text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Solana
            </button>
          </div>
          <Button variant="outline" size="icon" onClick={fetchActivity} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {loading && activity.length === 0 ? (
          <>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </>
        ) : (
          activity.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      item.action === "buy" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {item.action === "buy" ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : (
                      <TrendingDown className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.walletAlias}</span>
                      <Badge variant="outline" className="text-xs">
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.action === "buy" ? "Bought" : "Sold"}{" "}
                      <span className="font-medium text-foreground">${item.tokenSymbol}</span>
                      {" "}for{" "}
                      <span className="font-medium text-foreground">
                        {item.amountNative.toFixed(4)} {chain === "base" ? "ETH" : "SOL"}
                      </span>
                    </p>
                  </div>
                </div>
                <Link href={`/token/${item.tokenAddress}?chain=${chain}`}>
                  <Button size="sm" variant="outline">
                    Simulate
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))
        )}
        {!loading && activity.length === 0 && (
          <p className="text-center text-muted-foreground">No whale activity found.</p>
        )}
      </div>
    </div>
  );
}
