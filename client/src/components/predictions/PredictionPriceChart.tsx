import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { fetchPriceHistory } from "@/lib/predictionApi";
import { Skeleton } from "@/components/ui/skeleton";

interface PredictionPriceChartProps {
  tokenId: string;
  height?: number;
}

export function PredictionPriceChart({ tokenId, height = 300 }: PredictionPriceChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/predictions/markets", tokenId, "history"],
    queryFn: () => fetchPriceHistory(tokenId, "1d"),
    enabled: !!tokenId,
    staleTime: 60_000,
  });

  const [chartData, setChartData] = useState<Array<{ time: string; price: number }>>([]);

  useEffect(() => {
    if (data) {
      setChartData(
        data.map((d) => ({
          time: new Date(d.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          price: d.price * 100,
        }))
      );
    }
  }, [data]);

  if (isLoading) {
    return <Skeleton className="w-full rounded-md" style={{ height }} />;
  }

  if (chartData.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-xs text-[var(--text-tertiary)]"
        style={{ height }}
      >
        No price history available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="time"
          stroke="var(--text-tertiary)"
          tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          stroke="var(--text-tertiary)"
          tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--bg-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            fontSize: "12px",
          }}
          formatter={(value: number) => [`${value.toFixed(2)}%`, "YES Price"]}
        />
        <ReferenceLine y={50} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="price"
          stroke="var(--accent-gain)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "var(--accent-gain)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
