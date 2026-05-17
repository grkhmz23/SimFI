import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useChain } from "@/lib/chain-context";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useToast } from "@/hooks/use-toast";
import type { SportsbookEvent } from "@/lib/sportsbookApi";
import { lamportsToSol, weiToEth } from "@/lib/token-format";
import { formatNative, formatPct } from "@/lib/format";
import { ChainChip } from "@/components/ui/chain-chip";
import { cn } from "@/lib/utils";
import { Settings, TrendingUp, AlertCircle } from "lucide-react";

interface BetSlipProps {
  open: boolean;
  onClose: () => void;
  event: SportsbookEvent | null;
  selection: "home" | "away" | "draw" | null;
  odds: number;
}

const STAKE_PRESETS = [
  { label: "10%", pct: 0.1 },
  { label: "25%", pct: 0.25 },
  { label: "50%", pct: 0.5 },
  { label: "Max", pct: 1.0 },
] as const;

function formatStake(v: number): string {
  if (v === 0) return "";
  // 4 decimal places, strip trailing zeros
  return parseFloat(v.toFixed(4)).toString();
}

export function BetSlip({ open, onClose, event, selection, odds }: BetSlipProps) {
  const [stake, setStake] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [showSettings, setShowSettings] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const { activeChain } = useChain();
  const placeBet = usePlaceBet();
  const { toast } = useToast();

  // Safe balance from atomic units
  const balanceBigInt = BigInt(activeChain === "solana" ? (user?.balance ?? 0) : (user?.baseBalance ?? 0));
  const balanceHuman = activeChain === "solana" ? lamportsToSol(balanceBigInt) : weiToEth(balanceBigInt);

  const stakeNum = parseFloat(stake);
  const stakeValid = !isNaN(stakeNum) && stakeNum > 0;
  const stakeExceedsBalance = stakeValid && stakeNum > balanceHuman;

  const potentialPayout = stakeValid ? stakeNum * odds : 0;
  const potentialProfit = potentialPayout - (stakeValid ? stakeNum : 0);

  const selectionLabel = useMemo(() => {
    if (!event || !selection) return "";
    if (selection === "home") return event.homeTeam;
    if (selection === "away") return event.awayTeam;
    return "Draw";
  }, [event, selection]);

  const canSubmit =
    isAuthenticated &&
    !!event &&
    !!selection &&
    stakeValid &&
    !stakeExceedsBalance &&
    !placeBet.isPending;

  let submitError: string | null = null;
  if (!isAuthenticated) submitError = "Log in to place bets";
  else if (!stakeValid) submitError = null; // empty input, no error yet
  else if (stakeExceedsBalance) submitError = "Insufficient balance";

  async function handleSubmit() {
    if (!event || !selection || !canSubmit) return;
    try {
      await placeBet.mutateAsync({
        eventId: event.id,
        selection,
        chain: activeChain,
        stake: String(stakeNum),
        expectedOdds: odds,
        slippageBps,
      });
      toast({
        title: "Bet placed",
        description: `${formatNative(stakeNum, activeChain)} on ${selectionLabel} @ ${odds.toFixed(2)}`,
      });
      setStake("");
      onClose();
    } catch (err: any) {
      const raw = err?.error || err?.message || "Failed to place bet";
      const friendly =
        raw.includes("balance") || raw.includes("funds")
          ? "Insufficient balance to place this bet"
          : raw.includes("odds") || raw.includes("slippage")
          ? "Odds moved too far — try again"
          : raw.includes("closed") || raw.includes("started")
          ? "This event is no longer accepting bets"
          : raw.includes("network") || raw.includes("timeout")
          ? "Network error — check your connection"
          : raw;
      toast({ title: "Bet failed", description: friendly, variant: "destructive" });
    }
  }

  function applyPreset(pct: number) {
    if (balanceHuman <= 0) return;
    setStake(formatStake(balanceHuman * pct));
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="bg-[var(--bg-base)] border-l border-[var(--border-subtle)] flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-[var(--text-primary)]">Bet Slip</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-6 space-y-4">
          {!isAuthenticated && (
            <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4 text-sm text-[var(--text-secondary)]">
              Please log in to place bets.
            </div>
          )}

          {isAuthenticated && !event && (
            <div className="text-sm text-[var(--text-secondary)]">
              Select an event and outcome to get started.
            </div>
          )}

          {isAuthenticated && event && (
            <>
              {/* Selection summary */}
              <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {event.homeTeam} vs {event.awayTeam}
                  </span>
                  <ChainChip chain={activeChain} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {selectionLabel}
                  </span>
                  <Badge variant="outline" className="font-mono">
                    {odds.toFixed(2)}
                  </Badge>
                </div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  {event.league.replace(/_/g, " ").toUpperCase()}
                </div>
              </div>

              {/* Balance + stake input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-[var(--text-secondary)]">
                    Stake
                  </Label>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    Balance: {formatNative(balanceHuman, activeChain)}
                  </span>
                </div>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.00"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className={cn(
                    "bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)] font-mono",
                    stakeExceedsBalance && "border-[var(--accent-loss)]"
                  )}
                />

                {/* Stake presets */}
                <div className="flex gap-1.5">
                  {STAKE_PRESETS.map(({ label, pct }) => (
                    <button
                      key={label}
                      onClick={() => applyPreset(pct)}
                      className="flex-1 text-[10px] py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {submitError && (
                  <p className="flex items-center gap-1.5 text-xs text-[var(--accent-loss)]">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {submitError}
                  </p>
                )}
              </div>

              {/* Payout breakdown */}
              {stakeValid && !stakeExceedsBalance && (
                <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Stake</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {formatNative(stakeNum, activeChain)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Odds</span>
                    <span className="font-mono text-[var(--text-primary)]">{odds.toFixed(2)}×</span>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-2 flex items-center justify-between">
                    <span className="text-[var(--text-secondary)] flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Payout
                    </span>
                    <span className="font-mono font-medium text-[var(--accent-gain)]">
                      {formatNative(potentialPayout, activeChain)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-tertiary)]">Profit</span>
                    <span className="font-mono text-[var(--accent-gain)] text-[10px]">
                      +{formatNative(potentialProfit, activeChain)}{" "}
                      ({formatPct(((odds - 1) * 100))})
                    </span>
                  </div>
                </div>
              )}

              {/* Slippage settings */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  Slippage: {formatPct(slippageBps / 100)}
                </button>

                {showSettings && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[var(--text-secondary)]">Tolerance (bps)</Label>
                    <div className="flex gap-1.5">
                      {[50, 100, 200, 500].map((bps) => (
                        <button
                          key={bps}
                          onClick={() => setSlippageBps(bps)}
                          className={cn(
                            "flex-1 text-[10px] py-1 rounded border transition-colors",
                            slippageBps === bps
                              ? "border-[var(--accent-premium)] bg-[var(--accent-premium)]/10 text-[var(--accent-premium)]"
                              : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                          )}
                        >
                          {formatPct(bps / 100)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full"
              >
                {placeBet.isPending ? "Placing…" : "Place Bet"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
