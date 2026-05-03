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
import { useAuth } from "@/lib/auth-context";
import { usePredictionQuote } from "@/hooks/usePredictionQuote";
import { usePredictionTrade } from "@/hooks/usePredictionTrade";
import { usePredictionPositions } from "@/hooks/usePredictionPositions";
import { formatUsd, formatPct } from "@/lib/format";
import type { GammaMarket, QuoteResponse } from "@/lib/predictionApi";
import { Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PredictionTradeModalProps {
  market: GammaMarket;
  onClose: () => void;
}

type TradeOutcome = "YES" | "NO";
type TradeSide = "BUY" | "SELL";

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PredictionTradeModal({ market, onClose }: PredictionTradeModalProps) {
  const { isAuthenticated } = useAuth();
  const [outcome, setOutcome] = useState<TradeOutcome>("YES");
  const [side, setSide] = useState<TradeSide>("BUY");
  const [amountMode, setAmountMode] = useState<"shares" | "usd">("usd");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const quoteMutation = usePredictionQuote();
  const tradeMutation = usePredictionTrade();
  const { data: positions } = usePredictionPositions();

  const position = positions?.find(
    (p) => p.conditionId === market.conditionId && p.outcome === outcome
  );

  const canSell = side === "SELL" && !!position && position.shares > 0;

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
        const body: any = {
          conditionId: market.conditionId,
          outcome,
          side,
        };
        if (amountMode === "usd") {
          body.notionalUsd = num;
        } else {
          body.shares = num;
        }
        const q = await quoteMutation.mutateAsync(body);
        setQuote(q);
      } catch (err: any) {
        setQuote(null);
        setError(err?.message || "Quote failed");
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
    if (!quote) return;
    setTradeLoading(true);
    setError(null);
    try {
      const idempotencyKey = generateIdempotencyKey();
      await tradeMutation.mutateAsync({ quoteId: quote.quoteId, idempotencyKey });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Trade failed");
    } finally {
      setTradeLoading(false);
    }
  };

  const isSellDisabled = side === "SELL" && !canSell;

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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)] text-base leading-snug">
            {market.question}
          </DialogTitle>
        </DialogHeader>

        {/* Outcome + Side tabs */}
        <div className="space-y-3">
          <Tabs
            value={`${side}-${outcome}`}
            onValueChange={(v) => {
              const [s, o] = v.split("-") as [TradeSide, TradeOutcome];
              setSide(s);
              setOutcome(o);
              setQuote(null);
              setAmount("");
              setError(null);
            }}
          >
            <TabsList className="grid grid-cols-2 h-auto bg-[var(--bg-base)]">
              <TabsTrigger
                value="BUY-YES"
                className={cn(
                  "text-xs data-[state=active]:bg-[var(--accent-gain)] data-[state=active]:text-white"
                )}
              >
                Buy YES
              </TabsTrigger>
              <TabsTrigger
                value="BUY-NO"
                className={cn(
                  "text-xs data-[state=active]:bg-[var(--accent-loss)] data-[state=active]:text-white"
                )}
              >
                Buy NO
              </TabsTrigger>
            </TabsList>
            {position && position.shares > 0 && (
              <TabsList className="grid grid-cols-2 h-auto bg-[var(--bg-base)] mt-2">
                <TabsTrigger
                  value="SELL-YES"
                  disabled={position.outcome !== "YES"}
                  className="text-xs data-[state=active]:bg-[var(--accent-premium)] data-[state=active]:text-white"
                >
                  Sell YES
                </TabsTrigger>
                <TabsTrigger
                  value="SELL-NO"
                  disabled={position.outcome !== "NO"}
                  className="text-xs data-[state=active]:bg-[var(--accent-premium)] data-[state=active]:text-white"
                >
                  Sell NO
                </TabsTrigger>
              </TabsList>
            )}
          </Tabs>

          {/* Amount mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAmountMode("usd");
                setAmount("");
                setQuote(null);
              }}
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
              onClick={() => {
                setAmountMode("shares");
                setAmount("");
                setQuote(null);
              }}
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

          {/* Amount input */}
          <Input
            type="number"
            min="0"
            step={amountMode === "usd" ? "1" : "0.01"}
            placeholder={amountMode === "usd" ? "Amount in USD" : "Number of shares"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-primary)]"
          />

          {/* Quick select buttons */}
          {amountMode === "usd" && side === "BUY" && (
            <div className="flex items-center gap-2">
              {[10, 25, 50, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="text-[10px] px-2 py-1 rounded bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors"
                >
                  ${v}
                </button>
              ))}
            </div>
          )}

          {/* Quote preview */}
          {quoteLoading && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Getting quote...
            </div>
          )}

          {quote && !quoteLoading && (
            <div className="space-y-2 rounded-md bg-[var(--bg-base)] p-3 border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Shares</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {quote.shares.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Avg Price</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {formatUsd(quote.avgPrice)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Total</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {formatUsd(quote.totalUsd)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Slippage</span>
                <span className="font-mono text-[var(--text-tertiary)]">
                  {formatPct(quote.slippageBps / 100)}
                </span>
              </div>
              {side === "BUY" && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Payout if win</span>
                  <span className="font-mono text-[var(--accent-gain)]">
                    {formatUsd(quote.shares)}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-[var(--accent-loss)]">{error}</p>
          )}

          {/* Submit */}
          <Button
            onClick={handleTrade}
            disabled={!quote || tradeLoading || isSellDisabled}
            className={cn(
              "w-full",
              side === "BUY"
                ? "bg-[var(--accent-gain)] hover:bg-[var(--accent-gain)]/90"
                : "bg-[var(--accent-loss)] hover:bg-[var(--accent-loss)]/90"
            )}
          >
            {tradeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {side} {outcome} <ArrowRight className="ml-1 h-3 w-3" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
