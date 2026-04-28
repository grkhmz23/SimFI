import { useEffect, useRef, useState } from "react"
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
} from "lightweight-charts"
import { useChain } from "@/lib/chain-context"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TokenChartProps {
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  currentPrice: number
  priceChange24h?: number
  volume24h?: number
  liquidity?: number
  height?: string
  chain?: string
}

type Timeframe = "5S" | "15S" | "30S" | "1M" | "3M" | "5M"

const timeframes: Timeframe[] = ["5S", "15S", "30S", "1M", "3M", "5M"]

export default function TokenChart({
  tokenAddress,
  tokenSymbol,
  tokenName,
  currentPrice,
  height = "480px",
  chain: chainProp,
}: TokenChartProps) {
  const { activeChain } = useChain()
  const chartChain = chainProp || activeChain
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const priceLineRef = useRef<any>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1M")
  const [priceChange, setPriceChange] = useState<number>(0)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const chartHeight = parseInt(height.replace("px", ""), 10) || 480

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    // Clean up any existing chart instance when tokenAddress changes
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      priceLineRef.current = null
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9a9894",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.04)" },
        horzLines: { color: "rgba(255, 255, 255, 0.04)" },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "rgba(245, 243, 238, 0.1)",
          labelBackgroundColor: "#141416",
        },
        horzLine: {
          color: "rgba(245, 243, 238, 0.1)",
          labelBackgroundColor: "#141416",
        },
      },
      leftPriceScale: { visible: false },
      rightPriceScale: {
        visible: true,
        borderColor: "rgba(255, 255, 255, 0.08)",
        textColor: "#9a9894",
        scaleMargins: { top: 0.1, bottom: 0.25 },
        mode: 1,
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.06)",
        timeVisible: true,
        secondsVisible: false,
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#3fa876",
      downColor: "#c24d4d",
      borderUpColor: "#3fa876",
      borderDownColor: "#c24d4d",
      wickUpColor: "#3fa876",
      wickDownColor: "#c24d4d",
      priceScaleId: "right",
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.00000001,
      },
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#5f5d58",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    })

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    resizeObserverRef.current = new ResizeObserver(handleResize)
    resizeObserverRef.current.observe(chartContainerRef.current)

    return () => {
      if (resizeObserverRef.current && chartContainerRef.current) {
        resizeObserverRef.current.unobserve(chartContainerRef.current)
      }
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
        candleSeriesRef.current = null
        volumeSeriesRef.current = null
        priceLineRef.current = null
      }
    }
  }, [tokenAddress])

  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchTokenData = async (tf: Timeframe, isBackgroundRefresh = false) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      if (isBackgroundRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const response = await fetch(
        `/api/tokens/${tokenAddress}/ohlcv?timeframe=${tf}&chain=${chartChain}`,
        { signal: controller.signal }
      )
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `API returned ${response.status}`)
      }

      const data = await response.json()
      const candles = data.candles
      if (!Array.isArray(candles)) throw new Error("Invalid candles data")

      const candleData: CandlestickData[] = []
      const volumeData: HistogramData[] = []

      candles.forEach((candle: any) => {
        if (!Array.isArray(candle)) return
        const [timestamp, open, high, low, close, volume] = candle
        if (typeof timestamp !== "number" || !isFinite(timestamp)) return
        if ([open, high, low, close].some((v) => typeof v !== "number" || !isFinite(v))) return

        candleData.push({ time: timestamp as any, open, high, low, close })
        volumeData.push({
          time: timestamp as any,
          value: typeof volume === "number" && isFinite(volume) ? volume : 0,
          color:
            close >= open
              ? "rgba(63, 168, 118, 0.2)"
              : "rgba(194, 77, 77, 0.2)",
        })
      })

      // If no valid candles, try to use synthetic data from the API
      if (candleData.length === 0 && data.synthetic && Array.isArray(data.synthetic)) {
        data.synthetic.forEach((candle: any) => {
          if (!Array.isArray(candle)) return
          const [timestamp, open, high, low, close, volume] = candle
          if (typeof timestamp !== "number" || !isFinite(timestamp)) return
          if ([open, high, low, close].some((v) => typeof v !== "number" || !isFinite(v))) return
          candleData.push({ time: timestamp as any, open, high, low, close })
          volumeData.push({
            time: timestamp as any,
            value: typeof volume === "number" && isFinite(volume) ? volume : 0,
            color: "rgba(95, 93, 88, 0.15)",
          })
        })
      }

      if (candleData.length === 0) {
        throw new Error("No chart data available")
      }

      if (candleSeriesRef.current && volumeSeriesRef.current) {
        candleSeriesRef.current.setData(candleData)
        volumeSeriesRef.current.setData(volumeData)
      }

      const oldestPrice = candleData[0]?.close || currentPrice
      const latest = candleData[candleData.length - 1]?.close || currentPrice
      const change = oldestPrice > 0 ? ((latest - oldestPrice) / oldestPrice) * 100 : 0
      setPriceChange(change)
      setLastUpdate(new Date())

      if (candleSeriesRef.current) {
        if (priceLineRef.current) {
          candleSeriesRef.current.removePriceLine(priceLineRef.current)
        }
        priceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: latest,
          color: change >= 0 ? "#3fa876" : "#c24d4d",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "Last",
        })
      }

      if (chartRef.current) {
        chartRef.current.timeScale().fitContent()
      }

      setLoading(false)
      setRefreshing(false)
    } catch (err: any) {
      if (err.name === "AbortError") return
      setError(err?.message || "Failed to load chart")
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const isValidPrice = currentPrice !== null && currentPrice !== undefined && !isNaN(currentPrice) && isFinite(currentPrice)
    if (tokenAddress && isValidPrice) {
      fetchTokenData(selectedTimeframe)
    }
  }, [tokenAddress, selectedTimeframe, chartChain])

  useEffect(() => {
    const isValidPrice = currentPrice !== null && currentPrice !== undefined && !isNaN(currentPrice) && isFinite(currentPrice)
    if (!tokenAddress || !isValidPrice) return
    const interval = setInterval(() => fetchTokenData(selectedTimeframe, true), 30000)
    return () => clearInterval(interval)
  }, [tokenAddress, selectedTimeframe, chartChain])

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          {tokenSymbol}{" "}
          <span className="text-[var(--text-tertiary)] font-normal">Chart</span>
        </h3>
        {lastUpdate && !loading && (
          <span className="text-xs text-[var(--text-tertiary)]">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Timeframe Selector */}
      <div className="flex gap-1 mb-4 p-1 rounded-md bg-[hsl(240_4%_12%)] border border-[var(--border-subtle)]">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            className={cn(
              "flex-1 min-w-[48px] px-2 py-1.5 rounded-sm text-xs font-medium transition-colors",
              selectedTimeframe === tf
                ? "bg-[var(--bg-raised)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart Container */}
      <div className="relative" style={{ height: `${chartHeight}px` }}>
        {refreshing && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-[var(--bg-overlay)] px-2.5 py-1 text-xs text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating
          </div>
        )}

        {loading && !error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-raised)]/50 backdrop-blur-sm rounded-md">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-secondary)]">Loading chart...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-raised)]/50 backdrop-blur-sm rounded-md">
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <AlertCircle className="h-8 w-8 text-[var(--accent-loss)]" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                  Chart Unavailable
                </p>
                <p className="text-xs text-[var(--text-secondary)] mb-3">{error}</p>
                <Button size="sm" onClick={() => fetchTokenData(selectedTimeframe)}>
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  )
}
