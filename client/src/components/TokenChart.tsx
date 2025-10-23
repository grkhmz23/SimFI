import { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  LineController,
  BarController,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
  type ChartOptions
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { AlertCircle } from 'lucide-react';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  LineController,
  BarController,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

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

interface PriceDataPoint {
  timestamp: Date;
  price: number;
  volume: number;
}

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
  const chartRef = useRef(null);
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1M');
  const [priceChange, setPriceChange] = useState<number>(0);
  const [latestPrice, setLatestPrice] = useState<number>(currentPrice);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchTokenData = async (tf: Timeframe, isBackgroundRefresh = false) => {
    try {
      // Show refreshing state for background updates, loading state for initial/timeframe changes
      if (isBackgroundRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch real OHLCV data from backend
      const response = await fetch(`/api/tokens/${tokenAddress}/ohlcv?timeframe=${tf}`);
      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }

      const data = await response.json();
      const candles = data.candles || [];

      if (candles.length === 0) {
        throw new Error('No chart data available for this token');
      }

      // Convert OHLCV array to our format: [timestamp, open, high, low, close, volume]
      const priceHistory = candles.map((candle: any[]) => {
        const [timestamp, open, high, low, close, volume] = candle;
        return {
          timestamp: new Date(timestamp * 1000), // Convert Unix timestamp to milliseconds
          price: close, // Use closing price
          volume: volume || 0
        };
      });

      const oldestPrice = priceHistory[0]?.price || currentPrice;
      const latest = priceHistory[priceHistory.length - 1]?.price || currentPrice;
      const change = ((latest - oldestPrice) / oldestPrice) * 100;
      setPriceChange(change);
      setLatestPrice(latest); // Use the latest candle close price from OHLCV data

      const labels = priceHistory.map((d: PriceDataPoint) => d.timestamp);
      const prices = priceHistory.map((d: PriceDataPoint) => d.price);
      const volumes = priceHistory.map((d: PriceDataPoint) => d.volume);

      const formattedData = {
        labels: labels,
        datasets: [
          {
            label: 'Price',
            data: prices,
            borderColor: change >= 0 ? '#4CAF50' : '#f44336',
            backgroundColor: change >= 0 ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            borderWidth: 2,
            yAxisID: 'y'
          },
          {
            label: 'Volume',
            data: volumes,
            backgroundColor: 'rgba(100, 100, 100, 0.3)',
            type: 'bar' as const,
            yAxisID: 'y1',
            barThickness: 'flex' as const
          }
        ]
      };

      setChartData(formattedData);
      setLastUpdate(new Date());
      setLoading(false);
      setRefreshing(false);
    } catch (err: any) {
      console.error('Error generating chart data:', err);
      setError(err.message);
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (tokenAddress && currentPrice && !isNaN(currentPrice) && isFinite(currentPrice) && currentPrice > 0) {
      fetchTokenData(selectedTimeframe);
    }
  }, [tokenAddress, selectedTimeframe, currentPrice]);

  // Auto-refresh every 30 seconds (background updates)
  useEffect(() => {
    if (!tokenAddress || !currentPrice || isNaN(currentPrice) || !isFinite(currentPrice) || currentPrice <= 0) return;
    
    const interval = setInterval(() => {
      fetchTokenData(selectedTimeframe, true); // Mark as background refresh
    }, 30000);
    
    return () => clearInterval(interval);
  }, [tokenAddress, selectedTimeframe, currentPrice]);

  const getTimeUnit = (tf: Timeframe): 'minute' | 'hour' | 'day' | 'week' => {
    const units: Record<Timeframe, 'minute' | 'hour' | 'day' | 'week'> = {
      '5S': 'minute',
      '15S': 'minute',
      '30S': 'minute',
      '1M': 'minute',
      '3M': 'minute',
      '5M': 'minute'
    };
    return units[tf] || 'minute';
  };

  const chartOptions: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        padding: 16,
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: priceChange >= 0 ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)',
        borderWidth: 1,
        displayColors: true,
        callbacks: {
          title: function(context) {
            const x = context[0]?.parsed?.x;
            return x ? new Date(x).toLocaleString() : '';
          },
          label: function(context) {
            const label = context.dataset.label || '';
            const y = context.parsed?.y;
            if (!y) return '';
            if (label === 'Price') {
              return `Price: $${y.toFixed(8)} USD`;
            } else if (label === 'Volume') {
              return `Volume: $${y.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            }
            return '';
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: getTimeUnit(selectedTimeframe),
          displayFormats: {
            minute: 'HH:mm',
            hour: 'MMM d, HH:mm',
            day: 'MMM d',
            week: 'MMM d'
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: '#888',
          maxRotation: 0
        }
      },
      y: {
        type: 'linear',
        position: 'right',
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: '#888',
          callback: function(value) {
            return '$' + (value as number).toFixed(8);
          }
        }
      },
      y1: {
        type: 'linear',
        position: 'left',
        grid: {
          display: false
        },
        ticks: {
          color: '#666',
          callback: function(value) {
            const v = value as number;
            if (v >= 1000000) {
              return '$' + (v / 1000000).toFixed(1) + 'M';
            } else if (v >= 1000) {
              return '$' + (v / 1000).toFixed(1) + 'K';
            }
            return '$' + v.toFixed(0);
          }
        },
        max: chartData ? Math.max(...(chartData.datasets[1]?.data || [1])) * 2.5 : undefined
      }
    }
  };

  const timeframes: Timeframe[] = ['5S', '15S', '30S', '1M', '3M', '5M'];

  if (loading) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--card))', borderRadius: '12px' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
          <div className="text-muted-foreground">Loading chart data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--card))', borderRadius: '12px' }}>
        <div style={{ textAlign: 'center', color: 'hsl(var(--destructive))' }}>
          <AlertCircle className="h-12 w-12 mx-auto mb-4" />
          <div>Error loading chart: {error}</div>
          <button 
            onClick={() => fetchTokenData(selectedTimeframe)}
            className="mt-4 px-6 py-2 bg-destructive text-destructive-foreground rounded-md hover-elevate active-elevate-2"
            data-testid="button-retry-chart"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card p-5 rounded-xl" style={{ marginBottom: '20px' }}>
      {/* Token Info Header */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 style={{ margin: '0 0 8px 0', color: 'hsl(var(--foreground))', fontSize: '20px', fontWeight: '600' }}>
            {tokenSymbol} <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>/ {tokenName}</span>
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '24px', color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>
          <div>
            <div style={{ marginBottom: '4px' }}>24h Change</div>
            <div style={{ color: priceChange24h >= 0 ? '#4CAF50' : '#f44336', fontWeight: 'bold' }}>
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

      {/* Chart */}
      <div style={{ height: '400px', position: 'relative' }}>
        {/* Refreshing Indicator */}
        {refreshing && (
          <div className="absolute top-2 right-2 flex items-center gap-2 bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-medium animate-pulse z-10">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            Updating...
          </div>
        )}
        {chartData && (
          <Chart 
            ref={chartRef}
            type="line" 
            data={chartData} 
            options={chartOptions as any} 
          />
        )}
      </div>

      {/* Chart Footer with Update Info */}
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span>Updates every 30 seconds</span>
        <span>•</span>
        <span>Data from GeckoTerminal</span>
        {lastUpdate && (
          <>
            <span>•</span>
            <span data-testid="text-chart-last-update">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default TokenChart;
