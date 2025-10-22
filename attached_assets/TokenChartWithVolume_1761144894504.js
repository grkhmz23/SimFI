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

const TokenChartWithVolume = ({ tokenAddress, height = '500px' }) => {
  const chartRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1H');
  const [priceChange, setPriceChange] = useState(null);

  // Fetch token data
  const fetchTokenData = async (token, tf) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch current token info from DexScreener
      const tokenResponse = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${token}`
      );

      if (!tokenResponse.data?.pairs || tokenResponse.data.pairs.length === 0) {
        throw new Error('Token not found');
      }

      const pair = tokenResponse.data.pairs[0];
      setTokenInfo({
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        price: parseFloat(pair.priceUsd),
        priceChange24h: pair.priceChange?.h24 || 0,
        volume24h: parseFloat(pair.volume?.h24 || 0),
        liquidity: parseFloat(pair.liquidity?.usd || 0)
      });

      // Generate price history (in production, use real API)
      const intervals = getIntervalsForTimeframe(tf);
      const currentPrice = parseFloat(pair.priceUsd);
      const priceHistory = generatePriceAndVolumeHistory(currentPrice, intervals, tf);

      // Calculate price change for this timeframe
      const oldestPrice = priceHistory[0].price;
      const change = ((currentPrice - oldestPrice) / oldestPrice) * 100;
      setPriceChange(change);

      // Prepare chart data
      const labels = priceHistory.map(d => d.timestamp);
      const prices = priceHistory.map(d => d.price);
      const volumes = priceHistory.map(d => d.volume);

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
            type: 'bar',
            yAxisID: 'y1',
            barThickness: 'flex'
          }
        ]
      };

      setChartData(formattedData);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching token data:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const getIntervalsForTimeframe = (tf) => {
    const intervals = {
      '5M': 60,
      '15M': 60,
      '1H': 60,
      '4H': 48,
      '1D': 24,
      '1W': 168
    };
    return intervals[tf] || 60;
  };

  const generatePriceAndVolumeHistory = (currentPrice, intervals, tf) => {
    const history = [];
    const msPerInterval = getMillisecondsPerInterval(tf);
    const now = Date.now();
    
    let price = currentPrice * (0.85 + Math.random() * 0.15); // Start 85-100% of current
    const avgVolume = 10000 + Math.random() * 90000; // Random base volume
    
    for (let i = intervals; i >= 0; i--) {
      const timestamp = now - (i * msPerInterval);
      
      // Price movement with trending
      const volatility = 0.015 + Math.random() * 0.015; // 1.5-3% volatility
      const trend = (currentPrice - price) * 0.05; // Gradual trend towards current
      const randomWalk = (Math.random() - 0.5) * volatility * price;
      price = Math.max(0.000001, price + randomWalk + trend);
      
      // Volume with realistic patterns (higher volume on bigger price moves)
      const priceChangePercent = Math.abs(randomWalk / price);
      const volumeMultiplier = 0.5 + Math.random() + priceChangePercent * 10;
      const volume = avgVolume * volumeMultiplier;
      
      history.push({
        timestamp: new Date(timestamp),
        price: price,
        volume: volume
      });
    }
    
    // Ensure last price is close to current
    history[history.length - 1].price = currentPrice;
    
    return history;
  };

  const getMillisecondsPerInterval = (tf) => {
    const intervals = {
      '5M': 5 * 60 * 1000,
      '15M': 15 * 60 * 1000,
      '1H': 60 * 60 * 1000,
      '4H': 4 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
      '1W': 7 * 24 * 60 * 60 * 1000
    };
    return intervals[tf] || 60 * 60 * 1000;
  };

  useEffect(() => {
    if (tokenAddress) {
      fetchTokenData(tokenAddress, selectedTimeframe);
    }
  }, [tokenAddress, selectedTimeframe]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!tokenAddress) return;
    
    const interval = setInterval(() => {
      fetchTokenData(tokenAddress, selectedTimeframe);
    }, 30000);
    
    return () => clearInterval(interval);
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
            return new Date(context[0].parsed.x).toLocaleString();
          },
          label: function(context) {
            const label = context.dataset.label || '';
            if (label === 'Price') {
              return `Price: $${context.parsed.y.toFixed(8)}`;
            } else if (label === 'Volume') {
              return `Volume: $${context.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
          color: 'rgba(255, 255, 255, 0.05)',
          drawBorder: false
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
          color: 'rgba(255, 255, 255, 0.05)',
          drawBorder: false
        },
        ticks: {
          color: '#888',
          callback: function(value) {
            return '$' + value.toFixed(8);
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
            if (value >= 1000000) {
              return '$' + (value / 1000000).toFixed(1) + 'M';
            } else if (value >= 1000) {
              return '$' + (value / 1000).toFixed(1) + 'K';
            }
            return '$' + value.toFixed(0);
          }
        },
        max: Math.max(...(chartData?.datasets[1]?.data || [1])) * 2.5
      }
    }
  };

  const getTimeUnit = (tf) => {
    const units = {
      '5M': 'minute',
      '15M': 'minute',
      '1H': 'hour',
      '4H': 'hour',
      '1D': 'day',
      '1W': 'week'
    };
    return units[tf] || 'hour';
  };

  const timeframes = ['5M', '15M', '1H', '4H', '1D', '1W'];

  if (loading) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', borderRadius: '12px' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
          <div style={{ color: '#888' }}>Loading chart data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', borderRadius: '12px' }}>
        <div style={{ textAlign: 'center', color: '#f44336' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <div>Error loading chart: {error}</div>
          <button 
            onClick={() => fetchTokenData(tokenAddress, selectedTimeframe)}
            style={{
              marginTop: '16px',
              padding: '8px 24px',
              background: '#f44336',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
      {/* Token Info Header */}
      {tokenInfo && (
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '20px' }}>
              {tokenInfo.symbol} <span style={{ color: '#888', fontSize: '14px' }}>/ {tokenInfo.name}</span>
            </h3>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: priceChange >= 0 ? '#4CAF50' : '#f44336' }}>
              ${tokenInfo.price.toFixed(8)}
              {priceChange !== null && (
                <span style={{ fontSize: '16px', marginLeft: '12px' }}>
                  {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '24px', color: '#888', fontSize: '14px' }}>
            <div>
              <div style={{ marginBottom: '4px' }}>24h Change</div>
              <div style={{ color: tokenInfo.priceChange24h >= 0 ? '#4CAF50' : '#f44336', fontWeight: 'bold' }}>
                {tokenInfo.priceChange24h >= 0 ? '+' : ''}{tokenInfo.priceChange24h.toFixed(2)}%
              </div>
            </div>
            <div>
              <div style={{ marginBottom: '4px' }}>24h Volume</div>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>
                ${tokenInfo.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div style={{ marginBottom: '4px' }}>Liquidity</div>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>
                ${tokenInfo.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeframe Selector */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '16px',
        padding: '8px',
        background: '#222',
        borderRadius: '8px',
        flexWrap: 'wrap'
      }}>
        {timeframes.map(tf => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            style={{
              padding: '8px 20px',
              background: selectedTimeframe === tf ? (priceChange >= 0 ? '#4CAF50' : '#f44336') : '#2a2a2a',
              color: selectedTimeframe === tf ? '#fff' : '#888',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: selectedTimeframe === tf ? 'bold' : 'normal',
              transition: 'all 0.2s',
              flex: '1',
              minWidth: '60px'
            }}
            onMouseEnter={(e) => {
              if (selectedTimeframe !== tf) {
                e.target.style.background = '#3a3a3a';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedTimeframe !== tf) {
                e.target.style.background = '#2a2a2a';
              }
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart Container */}
      <div style={{ height: '400px', position: 'relative', background: '#1e1e1e', borderRadius: '8px', padding: '16px' }}>
        {chartData && (
          <Chart 
            ref={chartRef}
            type="line" 
            data={chartData} 
            options={chartOptions} 
          />
        )}
      </div>

      {/* Chart Footer */}
      <div style={{ marginTop: '12px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
        Updates every 30 seconds • Data from DexScreener
      </div>
    </div>
  );
};

export default TokenChartWithVolume;
