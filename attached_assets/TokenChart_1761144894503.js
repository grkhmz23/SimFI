import React, { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import axios from 'axios';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

const TokenChart = ({ tokenAddress, timeframe = '1H' }) => {
  const chartRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe);

  // Fetch price data from DexScreener
  const fetchPriceData = async (token, tf) => {
    try {
      setLoading(true);
      setError(null);

      // Get token info from DexScreener
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${token}`
      );

      if (!response.data?.pairs || response.data.pairs.length === 0) {
        throw new Error('No trading data found for this token');
      }

      // Get the main pair (usually highest liquidity)
      const pair = response.data.pairs[0];

      // For demo purposes, we'll generate mock historical data
      // In production, you'd use a service that provides historical OHLCV data
      const now = Date.now();
      const intervals = getIntervalsForTimeframe(tf);
      const priceHistory = generateMockPriceHistory(
        parseFloat(pair.priceUsd),
        intervals,
        tf
      );

      // Format data for Chart.js
      const formattedData = {
        labels: priceHistory.map(d => d.timestamp),
        datasets: [
          {
            label: 'Price (USD)',
            data: priceHistory.map(d => d.price),
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            borderWidth: 2
          }
        ]
      };

      setChartData(formattedData);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching price data:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Helper function to determine number of data points
  const getIntervalsForTimeframe = (tf) => {
    switch (tf) {
      case '5M': return 50;
      case '15M': return 60;
      case '1H': return 60;
      case '4H': return 48;
      case '1D': return 24;
      case '1W': return 168;
      default: return 60;
    }
  };

  // Generate mock price history (replace with real API in production)
  const generateMockPriceHistory = (currentPrice, intervals, tf) => {
    const history = [];
    const msPerInterval = getMillisecondsPerInterval(tf);
    const now = Date.now();
    
    let price = currentPrice * 0.8; // Start at 80% of current price
    
    for (let i = intervals; i >= 0; i--) {
      const timestamp = now - (i * msPerInterval);
      const volatility = 0.02; // 2% volatility
      const change = (Math.random() - 0.5) * volatility * price;
      price = Math.max(0.000001, price + change);
      
      // Gradually move towards current price
      if (i < 10) {
        price = price + (currentPrice - price) * 0.1;
      }
      
      history.push({
        timestamp: new Date(timestamp),
        price: price
      });
    }
    
    return history;
  };

  const getMillisecondsPerInterval = (tf) => {
    switch (tf) {
      case '5M': return 5 * 60 * 1000;
      case '15M': return 15 * 60 * 1000;
      case '1H': return 60 * 60 * 1000;
      case '4H': return 4 * 60 * 60 * 1000;
      case '1D': return 24 * 60 * 60 * 1000;
      case '1W': return 7 * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  };

  useEffect(() => {
    if (tokenAddress) {
      fetchPriceData(tokenAddress, selectedTimeframe);
    }
  }, [tokenAddress, selectedTimeframe]);

  const chartOptions = {
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
      title: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(75, 192, 192, 0.5)',
        borderWidth: 1,
        displayColors: false,
        callbacks: {
          label: function(context) {
            return `$${context.parsed.y.toFixed(8)}`;
          },
          title: function(context) {
            return new Date(context[0].parsed.x).toLocaleString();
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
        position: 'right',
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: '#888',
          callback: function(value) {
            return '$' + value.toFixed(8);
          }
        }
      }
    }
  };

  const getTimeUnit = (tf) => {
    switch (tf) {
      case '5M':
      case '15M':
        return 'minute';
      case '1H':
      case '4H':
        return 'hour';
      case '1D':
        return 'day';
      case '1W':
        return 'week';
      default:
        return 'hour';
    }
  };

  const timeframes = ['5M', '15M', '1H', '4H', '1D', '1W'];

  if (loading) {
    return (
      <div className="chart-container" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner">Loading chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chart-container" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f44336' }}>
        <div>Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="chart-wrapper">
      {/* Timeframe selector */}
      <div className="timeframe-selector" style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '16px',
        padding: '8px',
        background: '#1e1e1e',
        borderRadius: '8px'
      }}>
        {timeframes.map(tf => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            style={{
              padding: '6px 16px',
              background: selectedTimeframe === tf ? '#4CAF50' : '#2a2a2a',
              color: selectedTimeframe === tf ? '#fff' : '#888',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: selectedTimeframe === tf ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="chart-container" style={{ height: '400px', position: 'relative' }}>
        {chartData && (
          <Chart 
            ref={chartRef}
            type="line" 
            data={chartData} 
            options={chartOptions} 
          />
        )}
      </div>
    </div>
  );
};

export default TokenChart;
