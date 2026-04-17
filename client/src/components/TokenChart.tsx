import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData } from 'lightweight-charts';
import { useChain } from '@/lib/chain-context';
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
  chain?: string;
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
  height = '500px',
  chain: chainProp,
}: TokenChartProps) => {
  const { activeChain } = useChain();
  const chartChain = chainProp || activeChain;
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
      leftPriceScale: {
        visible: false,
      },
      rightPriceScale: {
        visible: true,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        textColor: '#d1d5db',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
        mode: 1, // Normal mode
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series (v5 API) - attach to right price scale
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#4ade80',
      downColor: '#f87171',
      borderUpColor: '#4ade80',
      borderDownColor: '#f87171',
      wickUpColor: '#4ade80',
      wickDownColor: '#f87171',
      priceScaleId: 'right',
      priceFormat: {
        type: 'price',
        precision: 8,
        minMove: 0.00000001,
      },
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

      const response = await fetch(`/api/tokens/${tokenAddress}/ohlcv?timeframe=${tf}&chain=${chartChain}`);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: Failed to fetch chart data`);
      }

      const data = await response.json();
      
      // Validate response structure
      if (!data || typeof data !== 'object') {
        console.error('Invalid response format:', data);
        throw new Error('Invalid response format from server');
      }
      
      const candles = data.candles;
      if (!Array.isArray(candles)) {
        console.error('Candles is not an array:', { data, candlesType: typeof candles });
        throw new Error('Invalid candles data format');
      }

      if (candles.length === 0) {
        throw new Error('No chart data available for this token');
      }

      // Format data for TradingView Lightweight Charts
      const candleData: CandlestickData[] = [];
      const volumeData: HistogramData[] = [];

      console.log(`Processing ${candles.length} candles for chart...`);
      
      candles.forEach((candle: any, index: number) => {
        try {
          // Handle both array and object formats
          let timestamp, open, high, low, close, volume;
          
          if (Array.isArray(candle)) {
            [timestamp, open, high, low, close, volume] = candle;
          } else {
            throw new Error(`Candle ${index} is not an array: ${JSON.stringify(candle).substring(0, 100)}`);
          }
          
          // Validate data - allow 0 values except for timestamp
          if (timestamp === undefined || timestamp === null || typeof timestamp !== 'number') {
            console.warn(`Skipping invalid candle at index ${index}: no valid timestamp`, candle);
            return;
          }
          
          if (typeof open !== 'number' || typeof high !== 'number' || 
              typeof low !== 'number' || typeof close !== 'number') {
            console.warn(`Skipping invalid candle at index ${index}: invalid OHLC values`, { open, high, low, close });
            return;
          }
          
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
        } catch (candleErr) {
          console.warn(`Error processing candle ${index}:`, candleErr);
        }
      });
      
      console.log(`Successfully formatted ${candleData.length} candles for TradingView`);

      // Update chart data
      if (candleSeriesRef.current && volumeSeriesRef.current) {
        candleSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);
      }

      // Calculate price change
      const oldestPrice = candles[0]?.[4] || currentPrice;
      const latest = candles[candles.length - 1]?.[4] || currentPrice;
      const change = oldestPrice > 0 ? ((latest - oldestPrice) / oldestPrice) * 100 : 0;
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
      const errorMsg = err?.message || err?.toString?.() || 'Unknown error';
      console.error('Chart data error details:', { 
        message: errorMsg,
        error: err,
        stack: err?.stack
      });
      setError(errorMsg);
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch data on mount and timeframe change
  useEffect(() => {
    if (tokenAddress) {
      // Only check that currentPrice is a valid number, allow 0 or very small prices
      const isValidPrice = currentPrice !== null && 
                          currentPrice !== undefined && 
                          !isNaN(currentPrice) && 
                          isFinite(currentPrice);
      if (isValidPrice) {
        fetchTokenData(selectedTimeframe);
      }
    }
  }, [tokenAddress, selectedTimeframe, currentPrice, chartChain]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const isValidPrice = currentPrice !== null && 
                        currentPrice !== undefined && 
                        !isNaN(currentPrice) && 
                        isFinite(currentPrice);
    if (!tokenAddress || !isValidPrice) return;
    
    const interval = setInterval(() => {
      fetchTokenData(selectedTimeframe, true);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [tokenAddress, selectedTimeframe, currentPrice, chartChain]);

  return (
    <div className="bg-card p-5 rounded-xl" style={{ marginBottom: '20px' }}>
      {/* Simplified Chart Header - just symbol and timeframe info */}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: '0', color: 'hsl(var(--foreground))', fontSize: '18px', fontWeight: '600' }}>
          {tokenSymbol} <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '14px', fontWeight: '400' }}>Chart</span>
        </h3>
        {lastUpdate && !loading && (
          <span className="text-xs text-muted-foreground">
            Updated: {lastUpdate.toLocaleTimeString()}
          </span>
        )}
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
    </div>
  );
};

export default TokenChart;
