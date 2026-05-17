import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChainChip } from "@/components/ui/chain-chip";
import type { SportsbookBet } from "@/lib/sportsbookApi";
import { formatNativeAmount, toBigInt, lamportsToSol, weiToEth } from "@/lib/token-format";
import { formatNative } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BetHistoryTableProps {
  bets: SportsbookBet[];
}

function statusVariant(status: string) {
  if (status === "won") return "gain" as const;
  if (status === "lost") return "loss" as const;
  if (status === "void") return "secondary" as const;
  return "outline" as const;
}

function eventLabel(bet: SportsbookBet): string {
  if (bet.homeTeam && bet.awayTeam) return `${bet.homeTeam} vs ${bet.awayTeam}`;
  return bet.eventId.slice(0, 8) + "…";
}

function selectionLabel(bet: SportsbookBet): string {
  if (bet.selection === "home" && bet.homeTeam) return bet.homeTeam;
  if (bet.selection === "away" && bet.awayTeam) return bet.awayTeam;
  return bet.selection.charAt(0).toUpperCase() + bet.selection.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PnlCell({ bet }: { bet: SportsbookBet }) {
  const chain = bet.chain as "solana" | "base";
  const stakeBig = toBigInt(bet.stake);
  const payoutBig = bet.payoutAmount != null ? toBigInt(bet.payoutAmount) : null;

  if (payoutBig == null) {
    const toNative = (v: bigint) => chain === "solana" ? lamportsToSol(v) : weiToEth(v);
    const potentialBig = toBigInt(bet.potentialPayout);
    return (
      <span className="font-mono text-xs text-[var(--text-secondary)]">
        {formatNative(toNative(potentialBig), chain)}
      </span>
    );
  }

  const pnl = payoutBig - stakeBig;
  const isGain = pnl >= 0n;
  const toNative = (v: bigint) => chain === "solana" ? lamportsToSol(v) : weiToEth(v);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={cn(
        "font-mono text-xs",
        isGain ? "text-[var(--accent-gain)]" : "text-[var(--accent-loss)]"
      )}>
        {isGain ? "+" : ""}{formatNative(toNative(pnl), chain)}
      </span>
      <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
        {formatNative(toNative(payoutBig), chain)} out
      </span>
    </div>
  );
}

// Mobile card view for each bet
function BetCard({ bet }: { bet: SportsbookBet }) {
  const chain = bet.chain as "solana" | "base";
  const stakeHuman = formatNativeAmount(toBigInt(bet.stake), chain, 4);

  return (
    <div className="rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--text-primary)] truncate">
            {eventLabel(bet)}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
            {formatDate(bet.placedAt)}
          </p>
        </div>
        <Badge variant={statusVariant(bet.status)} className="text-[10px] shrink-0">
          {bet.status}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="space-y-1">
          <p className="text-[var(--text-secondary)]">Selection</p>
          <p className="font-medium text-[var(--text-primary)]">
            {selectionLabel(bet)} @ {bet.oddsAtPlacement.toFixed(2)}
          </p>
        </div>
        <ChainChip chain={chain} />
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
        <div>
          <p className="text-[10px] text-[var(--text-tertiary)]">Stake</p>
          <p className="text-xs font-mono text-[var(--text-primary)]">
            {stakeHuman} {chain === "solana" ? "SOL" : "ETH"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[var(--text-tertiary)]">P&L</p>
          <PnlCell bet={bet} />
        </div>
      </div>
    </div>
  );
}

export function BetHistoryTable({ bets }: BetHistoryTableProps) {
  if (bets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[var(--text-secondary)] mb-1">No bets to display</p>
        <p className="text-xs text-[var(--text-tertiary)]">
          Place a bet from the Sportsbook to see it here
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards (< md) */}
      <div className="md:hidden space-y-3">
        {bets.map((bet) => <BetCard key={bet.id} bet={bet} />)}
      </div>

      {/* Desktop table (≥ md) */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[var(--border-subtle)] hover:bg-transparent">
              <TableHead className="text-[var(--text-secondary)]">Event</TableHead>
              <TableHead className="text-[var(--text-secondary)]">Selection</TableHead>
              <TableHead className="text-right text-[var(--text-secondary)]">Stake</TableHead>
              <TableHead className="text-right text-[var(--text-secondary)]">Odds</TableHead>
              <TableHead className="text-[var(--text-secondary)]">Status</TableHead>
              <TableHead className="text-right text-[var(--text-secondary)]">P&L</TableHead>
              <TableHead className="text-[var(--text-secondary)]">Chain</TableHead>
              <TableHead className="text-[var(--text-secondary)]">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bets.map((bet) => {
              const chain = bet.chain as "solana" | "base";
              return (
                <TableRow
                  key={bet.id}
                  className="border-b border-[var(--border-subtle)] table-row-hover"
                >
                  <TableCell className="text-xs max-w-[200px]">
                    <p className="text-[var(--text-primary)] truncate font-medium">
                      {eventLabel(bet)}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="capitalize text-[var(--text-primary)]">
                      {selectionLabel(bet)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono text-[var(--text-primary)]">
                    {formatNativeAmount(toBigInt(bet.stake), chain, 4)}{" "}
                    {chain === "solana" ? "SOL" : "ETH"}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono text-[var(--text-primary)]">
                    {bet.oddsAtPlacement.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(bet.status)} className="text-[10px]">
                      {bet.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <PnlCell bet={bet} />
                  </TableCell>
                  <TableCell>
                    <ChainChip chain={chain} />
                  </TableCell>
                  <TableCell className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {formatDate(bet.placedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
