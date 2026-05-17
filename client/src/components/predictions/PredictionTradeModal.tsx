import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { usePredictionQuote } from "@/hooks/usePredictionQuote";
import { usePredictionTrade } from "@/hooks/usePredictionTrade";
import { usePredictionPositions } from "@/hooks/usePredictionPositions";
import { usePredictionBalance } from "@/hooks/usePredictionBalance";
import { formatUsd, formatPct } from "@/lib/format";
import type { GammaMarket, QuoteResponse } from "@/lib/predictionApi";
import { Loader2, ArrowRight, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PredictionTradeModalProps {
  market: GammaMarket;
  onClose: () => void;
  initialOutcome?: "YES" | "NO";
  initialSide?: "BUY" | "SELL";
}

type TradeOutcome = "YES" | "NO";
type TradeSide = "BUY" | "SELL";

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PredictionTradeModal({
  market,
  onClose,
  initialOutcome = "YES",
  initialSide = "BUY",
}: PredictionTradeModalProps) {
  const { isAuthenticated } = useAuth();
  const [outcome, setOutcome] = useState<TradeOutcome>(initialOutcome);
  const [side, setSide] = useState<TradeSide>(initialSide);
  const [amountMode, setAmountMode] = useState<"shares" | "usd">("usd");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteSecondsLeft, setQuoteSecondsLeft] = useState(0);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const quoteMutation = usePredictionQuote();
  const tradeMutation = usePredictionTrade();
  const { data: positions } = usePredictionPositions();
  const { data: balance } = usePredictionBalance();

  const position = positions?.find(
    (p) => p.conditionId === market.conditionId && p.outcome === outcome
  );

  const hasShares = !!(position && position.shares > 0);
  const canSell = side === "SELL" && hasShares;

  // Quote countdown
  useEffect(() => {
    if (!quote) {
      setQuoteSecondsLeft(0);
      return;
    }
    const expiresAt = new Date(quote.expiresAt).getTime();
    const update = () => setQuoteSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [quote]);

  const isQuoteExpired = !!quote && quoteSecondsLeft <= 0;

  // Debounced quote fetch
  const fetchQuote = useCallback(
    async (value: string) => {
      if (!value || Number(value) <= 0) {
        setQuote(null);
        return;
      }
      setQuoteLoading(true);
      setError(null);
      try {
        const num = Number(value);
        const body: any = { conditionId: market.conditionId, outcome, side };
        if (amountMode === "usd") {
          body.notionalUsd = num;
        } else {
          body.shares = num;
        }
        const q = await quoteMutation.mutateAsync(body);
        setQuote(q);
      } catch (err: any) {
        setQuote(null);
        setError(err?.message || "Could not get a quote — try again");
      } finally {
        setQuoteLoading(false);
      }
    },
    [market.conditionId, outcome, side, amountMode, quoteMutation]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!amount || Number(amount) <= 0) {
      setQuote(null);
      return;
    }
    debounceRef.current = setTimeout(() => fetchQuote(amount), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount, fetchQuote]);

  const handleTrade = async () => {
    if (!quote || isQuoteExpired) return;
    setTradeLoading(true);
    setError(null);
    try {
      const idempotencyKey = generateIdempotencyKey();
      await tradeMutation.mutateAsync({ quoteId: quote.quoteId, idempotencyKey });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Trade failed — please try again");
    } finally {
      setTradeLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Login Required</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)]">
            Please log in to trade prediction markets.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  const marketClosed = market.closed || !market.active;
  const currentPrice = outcome === "YES"
    ? (market.outcomePrices[0] ?? 0)
    : (market.outcomePrices[1] ?? 0);

  function changeTab(s: TradeSide, o: TradeOutcome) {
    setSide(s);
    setOutcome(o);
    setQuote(null);
    setAmount("");
    setError(null);
  }

  const submitDisabled =
    !quote ||
    isQuoteExpired ||
    tradeLoading ||
    quoteLoading ||
    (side === "SELL" && !canSell) ||
    marketClosed;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)] text-sm leading-snug">
            {market.question}
          </DialogTitle>
        </DialogHeader>

        {marketClosed && (
          <div className="flex items-center gap-2 text-xs text-[var(--accent-loss)] bg-[var(--accent-loss)]/10 rounded-md px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            This market is closed — trading is no longer available
          </div>
        )}

        <div className="space-y-4">
          {/* Balance */}
          {balance != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">Paper balance</span>
              <span className="font-mono text-[var(--text-primary)]">
                {formatUsd(balance.balanceUsd)}
              </span>
            </div>
          )}

          {/* BUY tabs */}
          <div className="space-y-2">
            <Tabs
              value={`BUY-${outcome}`}
              onValueChange={(v) => {
                const [, o] = v.split("-") as ["BUY", TradeOutcome];
                changeTab("BUY", o);
              }}
            >
              <TabsList className="grid grid-cols-2 h-auto bg-[var(--bg-base)]">
                <TabsTrigger
                  value="BUY-YES"
                  disabled={marketClosed}
                  className="text-xs data-[state=active]:bg-[var(--accent-gain)] data-[state=active]:text-white"
                >
                  Buy YES · {formatPct((market.outcomePrices[0] ?? 0) * 100)}
                </TabsTrigger>
                <TabsTrigger
                  value="BUY-NO"
                  disabled={marketClosed}
                  className="text-xs data-[state=active]:bg-[var(--accent-loss)] data-[state=active]:text-white"
                >
                  Buy NO · {formatPct((market.outcomePrices[1] ?? 0) * 100)}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* SELL tab — only shown when user has shares in the active outcome */}
            {hasShares && side === "SELL" ? null : null}
            {position && position.shares > 0 && (
              <button
                onClick={() => changeTab("SELL", outcome)}
                className={cn(
                  "w-full text-xs py-1.5 rounded-md border transition-colors text-left px-3",
                  side === "SELL"
                    ? "border-[var(--accent-premium)] bg-[var(--accent-premium)]/10 text-[var(--accent-premium)]"
                    : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                )}
              >
                Sell {outcome} — {position.shares.toFixed(2)} shares @ {formatUsd(position.avgPrice)}
              </button>
            )}

            {side === "SELL" && !hasShares && (
              <div className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-base)] rounded-md px-3 py-2 border border-[var(--border-subtle)]">
                No {outcome} shares to sell in this market
              </div>
            )}
          </div>

          {/* Amount mode toggle */}
          {side === "BUY" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setAmountMode("usd"); setAmount(""); setQuote(null); }}
                className={cn(
                  "text-xs px-2 py-1 rounded border transition-colors",
                  amountMode === "usd"
                    ? "border-[var(--border-strong)] text-[var(--text-primary)] bg-[var(--bg-base)]"
                    : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                )}
              >
                USD
              </button>
              <button
                onClick={() => { setAmountMode("shares"); setAmount(""); setQuote(null); }}
                className={cn(
                  "text-xs px-2 py-1 rounded border transition-colors",
                  amountMode === "shares"
                    ? "border-[var(--border-strong)] text-[var(--text-primary)] bg-[var(--bg-base)]"
                    : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                )}
              >
                Shares
              </button>
            </div>
          )}

          {/* Amount input */}
          {(!marketClosed || side === "SELL") && (
            <Input
              type="number"
              min="0"
              step={amountMode === "usd" ? "1" : "0.01"}
              placeholder={
                side === "SELL"
                  ? "Shares to sell"
                  : amountMode === "usd"
                  ? "Amount in USD"
                  : "Number of shares"
              }
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-primary)] font-mono"
            />
          )}

          {/* Quick USD presets for buy */}
          {amountMode === "usd" && side === "BUY" && !marketClosed && (
            <div className="flex items-center gap-1.5">
              {[10, 25, 50, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="flex-1 text-[10px] py-1 rounded bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors"
                >
                  ${v}
                </button>
              ))}
              {balance && (
                <button
                  onClick={() => setAmount(String(Math.floor(balance.balanceUsd)))}
                  className="flex-1 text-[10px] py-1 rounded bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors"
                >
                  Max
                </button>
              )}
            </div>
          )}

          {/* Quote preview */}
          {quoteLoading && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Getting quote…
            </div>
          )}

          {quote && !quoteLoading && (
            <div className="space-y-2 rounded-md bg-[var(--bg-base)] p-3 border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Shares</span>
                <span className="font-mono text-[var(--text-primary)]">{quote.shares.toFixed(4)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Avg Price</span>
                <span className="font-mono text-[var(--text-primary)]">{formatUsd(quote.avgPrice)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Total</span>
                <span className="font-mono font-medium text-[var(--text-primary)]">{formatUsd(quote.totalUsd)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Slippage</span>
                <span className="font-mono text-[var(--text-tertiary)]">{formatPct(quote.slippageBps / 100)}</span>
              </div>
              {side === "BUY" && (
                <div className="flex items-center justify-between text-xs border-t border-[var(--border-subtle)] pt-2">
                  <span className="text-[var(--text-secondary)]">Payout if {outcome}</span>
                  <span className="font-mono text-[var(--accent-gain)]">{formatUsd(quote.shares)}</span>
                </div>
              )}
              {/* Quote expiry */}
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 text-[var(--text-tertiary)]">
                  <Clock className="h-3 w-3" />
                  Quote
                </span>
                {isQuoteExpired ? (
                  <Badge variant="loss" className="text-[10px] px-1 h-4">Expired — re-enter amount</Badge>
                ) : (
                  <span className="text-[var(--text-tertiary)]">expires in {quoteSecondsLeft}s</span>
                )}
              </div>
            </div>
          )}

          {/* Current price context */}
          {!quote && !quoteLoading && (
            <p className="text-[10px] text-[var(--text-tertiary)]">
              Current {outcome} price: {formatUsd(currentPrice)} / share ·{" "}
              {formatPct(currentPrice * 100)} implied probability
            </p>
          )}

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--accent-loss)]">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {error}
            </p>
          )}

          {/* Submit */}
          <Button
            onClick={handleTrade}
            disabled={submitDisabled}
            className={cn(
              "w-full",
              side === "BUY" && outcome === "YES"
                ? "bg-[var(--accent-gain)] hover:bg-[var(--accent-gain)]/90"
                : side === "BUY" && outcome === "NO"
                ? "bg-[var(--accent-loss)] hover:bg-[var(--accent-loss)]/90"
                : "bg-[var(--accent-premium)] hover:bg-[var(--accent-premium)]/90"
            )}
          >
            {tradeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {side === "BUY" ? "Buy" : "Sell"} {outcome}
                <ArrowRight className="ml-1 h-3 w-3" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
