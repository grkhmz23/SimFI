import { forwardRef } from 'react';
import type { Trade } from '@shared/schema';
import { lamportsToSol, weiToEth, toBigInt } from '@/lib/token-format';
import { formatUsdText, formatPct } from '@/lib/format';

interface TradeShareCardProps {
  trade: Trade;
  nativePrice: number;
}

function formatHoldTimeShort(opened: string | Date, closed: string | Date): string {
  const open = typeof opened === 'string' ? new Date(opened) : opened;
  const close = typeof closed === 'string' ? new Date(closed) : closed;
  const ms = close.getTime() - open.getTime();
  if (ms <= 0) return '0m';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatDateShort(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const TradeShareCard = forwardRef<HTMLDivElement, TradeShareCardProps>(
  ({ trade, nativePrice }, ref) => {
    const pl = toBigInt(trade.profitLoss);
    const spent = toBigInt(trade.solSpent);
    const plPercent = spent > 0n ? (Number(pl) / Number(spent)) * 100 : 0;
    const isGain = pl >= 0n;

    const plNative =
      trade.chain === 'solana' ? lamportsToSol(pl) : weiToEth(pl);
    const plUsd = plNative * nativePrice;

    const entryPriceNative =
      trade.chain === 'solana'
        ? lamportsToSol(toBigInt(trade.entryPrice))
        : weiToEth(toBigInt(trade.entryPrice));
    const entryPriceUsd = entryPriceNative * nativePrice;

    const exitPriceNative =
      trade.chain === 'solana'
        ? lamportsToSol(toBigInt(trade.exitPrice))
        : weiToEth(toBigInt(trade.exitPrice));
    const exitPriceUsd = exitPriceNative * nativePrice;

    const tokenQty = Number(toBigInt(trade.amount)) / 10 ** (trade.decimals || 6);
    const chainLabel = trade.chain === 'solana' ? 'Solana' : 'Base';
    const chainColor = trade.chain === 'solana' ? '#14F195' : '#0052FF';

    return (
      <div
        ref={ref}
        style={{
          width: 1200,
          height: 675,
          background: 'linear-gradient(135deg, #0a0a0f 0%, #12121a 50%, #0d0d14 100%)',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          padding: 64,
          boxSizing: 'border-box',
        }}
      >
        {/* Background accents */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: isGain
              ? 'radial-gradient(circle, rgba(20,241,149,0.08) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -150,
            left: -150,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Top bar: Logo + Chain */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 48,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img
              src="/simfi-logo.png"
              alt="SimFi"
              style={{ width: 40, height: 40, objectFit: 'contain' }}
              crossOrigin="anonymous"
            />
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.02em',
              }}
            >
              SimFi
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 18px',
              borderRadius: 999,
              border: `1.5px solid ${chainColor}40`,
              background: `${chainColor}10`,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: chainColor,
              }}
            />
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: chainColor,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {chainLabel}
            </span>
          </div>
        </div>

        {/* Token info */}
        <div style={{ marginBottom: 48 }}>
          <h2
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: '#ffffff',
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
            }}
          >
            ${trade.tokenSymbol}
          </h2>
          <p
            style={{
              fontSize: 24,
              color: '#8b8b9a',
              margin: '12px 0 0 0',
              fontWeight: 400,
            }}
          >
            {trade.tokenName}
          </p>
        </div>

        {/* Main grid: Entry/Exit | P&L */}
        <div style={{ display: 'flex', gap: 64, flex: 1 }}>
          {/* Left: Entry → Exit */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              {/* Entry */}
              <div>
                <p
                  style={{
                    fontSize: 14,
                    color: '#6b6b7b',
                    margin: '0 0 6px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                  }}
                >
                  Entry
                </p>
                <p
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: '#e4e4e7',
                    margin: 0,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  }}
                >
                  {formatUsdText(entryPriceUsd)}
                </p>
              </div>

              {/* Arrow */}
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: 'linear-gradient(90deg, #3f3f46, #52525b)',
                  position: 'relative',
                  borderRadius: 1,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    right: -2,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 0,
                    height: 0,
                    borderTop: '6px solid transparent',
                    borderBottom: '6px solid transparent',
                    borderLeft: '8px solid #52525b',
                  }}
                />
              </div>

              {/* Exit */}
              <div>
                <p
                  style={{
                    fontSize: 14,
                    color: '#6b6b7b',
                    margin: '0 0 6px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                  }}
                >
                  Exit
                </p>
                <p
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: '#ffffff',
                    margin: 0,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  }}
                >
                  {formatUsdText(exitPriceUsd)}
                </p>
              </div>
            </div>

            {/* Meta row */}
            <div style={{ display: 'flex', gap: 40, marginTop: 'auto' }}>
              <div>
                <p
                  style={{
                    fontSize: 13,
                    color: '#6b6b7b',
                    margin: '0 0 4px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                  }}
                >
                  Quantity
                </p>
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: '#d4d4d8',
                    margin: 0,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  }}
                >
                  {tokenQty >= 1_000_000
                    ? `${(tokenQty / 1_000_000).toFixed(2)}M`
                    : tokenQty >= 1_000
                      ? `${(tokenQty / 1_000).toFixed(2)}K`
                      : tokenQty.toFixed(2)}
                </p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: 13,
                    color: '#6b6b7b',
                    margin: '0 0 4px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                  }}
                >
                  Hold Time
                </p>
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: '#d4d4d8',
                    margin: 0,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  }}
                >
                  {formatHoldTimeShort(trade.openedAt, trade.closedAt)}
                </p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: 13,
                    color: '#6b6b7b',
                    margin: '0 0 4px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                  }}
                >
                  Date
                </p>
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: '#d4d4d8',
                    margin: 0,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  }}
                >
                  {formatDateShort(trade.closedAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Big P&L */}
          <div
            style={{
              width: 420,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <p
              style={{
                fontSize: 14,
                color: '#6b6b7b',
                margin: '0 0 12px 0',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              Realized P&L
            </p>
            <p
              style={{
                fontSize: 96,
                fontWeight: 800,
                color: isGain ? '#14F195' : '#ef4444',
                margin: 0,
                lineHeight: 1,
                letterSpacing: '-0.04em',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              }}
            >
              {isGain ? '+' : ''}
              {formatUsdText(plUsd)}
            </p>
            <div
              style={{
                marginTop: 16,
                padding: '10px 24px',
                borderRadius: 12,
                background: isGain ? 'rgba(20,241,149,0.12)' : 'rgba(239,68,68,0.12)',
                border: `2px solid ${isGain ? 'rgba(20,241,149,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: isGain ? '#14F195' : '#ef4444',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                }}
              >
                {isGain ? '+' : ''}
                {formatPct(plPercent)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom watermark */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: 64,
            right: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: '#3f3f46',
              fontWeight: 500,
              letterSpacing: '0.05em',
            }}
          >
            Paper Trade • simfi.fun
          </span>
          <span
            style={{
              fontSize: 14,
              color: '#3f3f46',
              fontWeight: 500,
              letterSpacing: '0.05em',
            }}
          >
            Not Financial Advice
          </span>
        </div>
      </div>
    );
  }
);

TradeShareCard.displayName = 'TradeShareCard';
