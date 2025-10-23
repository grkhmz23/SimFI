import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData } from 'lightweight-charts';
import { AlertCircle } from 'lucide-react';

interface TokenChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  currentPrice: number;
  priceChange24h?: number;
  volume24h?: number;
  liquidity?: number;
  height?: string;
}

type Timeframe = '5S' | '15S' | '30S' | '1M' | '3M' | '5M';

const TokenChart = ({ 
  tokenAddress, 
  tokenSymbol, 
  tokenName, 
  currentPrice,
  priceChange24h = 0,
  volume24h = 0,
  liquidity = 0,
  height = '500px' 
}: TokenChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const priceLineRef = useRef<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1M');
  const [priceChange, setPriceChange] = useState<number>(0);
  const [latestPrice, setLatestPrice] = useState<number>(currentPrice);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const timeframes: Timeframe[] = ['5S', '15S', '30S', '1M', '3M', '5M'];
  
  // Parse height prop to number (remove 'px' if present)
  const chartHeight = parseInt(height.replace('px', ''), 10) || 400;

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(172, 207, 223, 0.3)',
          labelBackgroundColor: '#4f46e5',
        },
        horzLine: {
          color: 'rgba(172, 207, 223, 0.3)',
          labelBackgroundColor: '#4f46e5',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#4ade80',
      downColor: '#f87171',
      borderUpColor: '#4ade80',
      borderDownColor: '#f87171',
      wickUpColor: '#4ade80',
      wickDownColor: '#f87171',
    });

    // Add volume series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#6366f1',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(chartContainerRef.current);

    return () => {
      if (resizeObserverRef.current && chartContainerRef.current) {
        resizeObserverRef.current.unobserve(chartContainerRef.current);
      }
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);

  const fetchTokenData = async (tf: Timeframe, isBackgroundRefresh = false) => {
    try {
      if (isBackgroundRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await fetch(`/api/tokens/${tokenAddress}/ohlcv?timeframe=${tf}`);
      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }

      const data = await response.json();
      const candles = data.candles || [];

      if (candles.length === 0) {
        throw new Error('No chart data available for this token');
      }

      // Format data for TradingView Lightweight Charts
      const candleData: CandlestickData[] = [];
      const volumeData: HistogramData[] = [];

      candles.forEach((candle: number[]) => {
        const [timestamp, open, high, low, close, volume] = candle;
        
        // TradingView expects Unix timestamps in seconds (not milliseconds)
        // GeckoTerminal returns timestamps in seconds, so use as-is
        candleData.push({
          time: timestamp as any,
          open,
          high,
          low,
          close,
        });

        volumeData.push({
          time: timestamp as any,
          value: volume || 0,
          color: close >= open ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)',
        });
      });

      // Update chart data
      if (candleSeriesRef.current && volumeSeriesRef.current) {
        candleSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);
      }

      // Calculate price change
      const oldestPrice = candles[0]?.[4] || currentPrice;
      const latest = candles[candles.length - 1]?.[4] || currentPrice;
      const change = ((latest - oldestPrice) / oldestPrice) * 100;
      setPriceChange(change);
      setLatestPrice(latest);
      setLastUpdate(new Date());

      // Add current price line indicator
      if (candleSeriesRef.current) {
        // Remove existing price line if it exists
        if (priceLineRef.current) {
          candleSeriesRef.current.removePriceLine(priceLineRef.current);
        }
        
        // Create new price line with current price
        priceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: latest,
          color: change >= 0 ? '#22c55e' : '#ef4444',
          lineWidth: 2,
          lineStyle: 2, // Dashed line
          axisLabelVisible: true,
          title: 'Last',
        });
      }

      // Fit content
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }

      setLoading(false);
      setRefreshing(false);
    } catch (err: any) {
      console.error('Chart data error:', err);
      setError(err.message || 'Failed to load chart data');
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch data on mount and timeframe change
  useEffect(() => {
    if (tokenAddress && currentPrice && !isNaN(currentPrice) && isFinite(currentPrice) && currentPrice > 0) {
      fetchTokenData(selectedTimeframe);
    }
  }, [tokenAddress, selectedTimeframe, currentPrice]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!tokenAddress || !currentPrice || isNaN(currentPrice) || !isFinite(currentPrice) || currentPrice <= 0) return;
    
    const interval = setInterval(() => {
      fetchTokenData(selectedTimeframe, true);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [tokenAddress, selectedTimeframe, currentPrice]);

  return (
    <div className="bg-card p-5 rounded-xl" style={{ marginBottom: '20px' }}>
      {/* Token Info Header */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 style={{ margin: '0 0 8px 0', color: 'hsl(var(--foreground))', fontSize: '20px', fontWeight: '600' }}>
            {tokenSymbol} <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>/ {tokenName}</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px', fontWeight: '700', color: 'hsl(var(--foreground))' }}>
              ${latestPrice.toFixed(8)}
            </span>
            <span style={{ 
              fontSize: '16px', 
              fontWeight: '600',
              color: priceChange >= 0 ? '#4ade80' : '#f87171'
            }}>
              {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '24px', color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>
          <div>
            <div style={{ marginBottom: '4px' }}>24h Change</div>
            <div style={{ color: priceChange24h >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
              {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
            </div>
          </div>
          <div>
            <div style={{ marginBottom: '4px' }}>24h Volume</div>
            <div style={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}>
              ${volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: '4px' }}>Liquidity</div>
            <div style={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}>
              ${liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      {/* Timeframe Selector */}
      <div className="flex gap-2 mb-4 p-2 bg-muted/50 rounded-lg flex-wrap">
        {timeframes.map(tf => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all flex-1 min-w-[60px] ${
              selectedTimeframe === tf 
                ? (priceChange >= 0 ? 'bg-green-600 text-white' : 'bg-red-600 text-white')
                : 'bg-muted text-muted-foreground hover-elevate active-elevate-2'
            }`}
            data-testid={`button-timeframe-${tf}`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart Container */}
      <div style={{ height: `${chartHeight}px`, position: 'relative' }}>
        {/* Refreshing Indicator */}
        {refreshing && (
          <div className="absolute top-2 right-2 flex items-center gap-2 bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-medium animate-pulse z-10">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            Updating...
          </div>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm rounded-lg z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground text-sm">Loading chart data...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm rounded-lg z-20">
            <div className="flex flex-col items-center gap-3 max-w-md text-center px-4">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <div>
                <p className="text-destructive font-medium mb-2">Failed to Load Chart</p>
                <p className="text-muted-foreground text-sm mb-4">{error}</p>
                <button
                  onClick={() => fetchTokenData(selectedTimeframe)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover-elevate active-elevate-2"
                  data-testid="button-retry-chart"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TradingView Chart */}
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Footer - Last Update */}
      {lastUpdate && !loading && (
        <div className="mt-3 text-xs text-muted-foreground text-right">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default TokenChart;
