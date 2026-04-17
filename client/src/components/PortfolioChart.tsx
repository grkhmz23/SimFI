import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
interface PortfolioAnalytics {
  balanceHistory: { date: string; balance: number }[];
  winCount: number;
  lossCount: number;
  bestTrade: any | null;
  worstTrade: any | null;
  dailyPnl: { date: string; pnl: number }[];
}

interface PortfolioChartProps {
  analytics: PortfolioAnalytics;
  chain: "base" | "solana";
}

const COLORS = {
  win: "#22c55e",
  loss: "#ef4444",
  line: "#3b82f6",
  bar: "#8b5cf6",
};

export function PortfolioCharts({ analytics, chain }: PortfolioChartProps) {
  const [timeframe, setTimeframe] = useState<"7D" | "30D" | "ALL">("7D");

  const filteredBalanceHistory = (() => {
    if (timeframe === "ALL") return analytics.balanceHistory;
    const days = timeframe === "7D" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return analytics.balanceHistory.filter((d) => new Date(d.date) >= cutoff);
  })();

  const winLossData = [
    { name: "Wins", value: analytics.winCount },
    { name: "Losses", value: analytics.lossCount },
  ];

  const nativeSymbol = chain === "base" ? "ETH" : "SOL";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Balance History */}
      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Balance Over Time</CardTitle>
          <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="7D" className="text-xs px-2">7D</TabsTrigger>
              <TabsTrigger value="30D" className="text-xs px-2">30D</TabsTrigger>
              <TabsTrigger value="ALL" className="text-xs px-2">ALL</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredBalanceHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  stroke="#94a3b8"
                  fontSize={10}
                />
                <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v: number) => `${v.toFixed(2)}`} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                  formatter={(v: number) => [`${v.toFixed(4)} ${nativeSymbol}`, "Balance"]}
                  labelFormatter={(l) => new Date(l).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke={COLORS.line}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Win/Loss Pie */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Win / Loss Ratio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={winLossData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={4}
                >
                  <Cell fill={COLORS.win} />
                  <Cell fill={COLORS.loss} />
                </Pie>
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex justify-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.win }} />
              Wins {analytics.winCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.loss }} />
              Losses {analytics.lossCount}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Daily PnL Bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Daily PnL (7D)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.dailyPnl}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { weekday: "narrow" })}
                  stroke="#94a3b8"
                  fontSize={10}
                />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                  formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v.toFixed(4)} ${nativeSymbol}`, "PnL"]}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {analytics.dailyPnl.map((entry: { pnl: number }, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? COLORS.win : COLORS.loss} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
