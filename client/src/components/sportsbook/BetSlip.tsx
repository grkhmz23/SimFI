import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { useChain } from "@/lib/chain-context";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useToast } from "@/hooks/use-toast";
import type { SportsbookEvent } from "@/lib/sportsbookApi";
import { X, Settings } from "lucide-react";

interface BetSlipProps {
  open: boolean;
  onClose: () => void;
  event: SportsbookEvent | null;
  selection: "home" | "away" | "draw" | null;
  odds: number;
}

export function BetSlip({ open, onClose, event, selection, odds }: BetSlipProps) {
  const [stake, setStake] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [showSettings, setShowSettings] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const { activeChain } = useChain();
  const placeBet = usePlaceBet();
  const { toast } = useToast();

  const balance = activeChain === "solana" ? (user?.balance ?? 0) : (user?.baseBalance ?? 0);
  const symbol = activeChain === "solana" ? "SOL" : "ETH";
  const decimals = activeChain === "solana" ? 1e9 : 1e18;
  const balanceHuman = Number(balance) / decimals;

  const stakeNum = parseFloat(stake);
  const potentialPayout = !isNaN(stakeNum) && stakeNum > 0 ? stakeNum * odds : 0;

  const canSubmit = isAuthenticated && stakeNum > 0 && stakeNum <= balanceHuman;

  const selectionLabel = useMemo(() => {
    if (!event || !selection) return "";
    if (selection === "home") return event.homeTeam;
    if (selection === "away") return event.awayTeam;
    return "Draw";
  }, [event, selection]);

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
        description: `${stakeNum} ${symbol} on ${selectionLabel} @ ${odds.toFixed(2)}`,
      });

      setStake("");
      onClose();
    } catch (err: any) {
      const msg = err?.error || err?.message || "Failed to place bet";
      toast({ title: "Bet failed", description: msg, variant: "destructive" });
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="bg-[var(--bg-base)] border-l border-[var(--border-subtle)]">
        <SheetHeader>
          <SheetTitle className="text-[var(--text-primary)]">Bet Slip</SheetTitle>
        </SheetHeader>

        {!isAuthenticated && (
          <div className="mt-6 text-sm text-[var(--text-secondary)]">
            Please log in to place bets.
          </div>
        )}

        {isAuthenticated && event && (
          <div className="mt-6 space-y-4">
            <div className="text-sm">
              <div className="text-[var(--text-secondary)]">{event.homeTeam} vs {event.awayTeam}</div>
              <div className="font-medium text-[var(--text-primary)] mt-1">
                Selection: {selectionLabel} @ {odds.toFixed(2)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[var(--text-secondary)]">Stake ({symbol})</Label>
                <span className="text-xs text-[var(--text-tertiary)]">
                  Balance: {balanceHuman.toFixed(4)} {symbol}
                </span>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)]"
              />
              {stakeNum > balanceHuman && (
                <p className="text-xs text-[var(--accent-loss)]">Insufficient balance</p>
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Potential payout</span>
              <span className="font-mono font-medium text-[var(--accent-gain)]">
                {potentialPayout.toFixed(4)} {symbol}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="text-[var(--text-tertiary)]"
              >
                <Settings className="h-3 w-3 mr-1" />
                Slippage
              </Button>
              <span className="text-xs text-[var(--text-tertiary)]">{slippageBps / 100}%</span>
            </div>

            {showSettings && (
              <div className="space-y-2">
                <Label className="text-xs text-[var(--text-secondary)]">Slippage tolerance (bps)</Label>
                <Input
                  type="number"
                  min="0"
                  max="10000"
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(Number(e.target.value))}
                  className="bg-[var(--bg-raised)] border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || placeBet.isPending}
              className="w-full"
            >
              {placeBet.isPending ? "Placing..." : "Place Bet"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
