import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { SportsbookBet } from "@/lib/sportsbookApi";

interface BetHistoryTableProps {
  bets: SportsbookBet[];
}

export function BetHistoryTable({ bets }: BetHistoryTableProps) {
  if (bets.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[var(--text-tertiary)]">
        No bets to display.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Selection</TableHead>
            <TableHead>Stake</TableHead>
            <TableHead>Odds</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Payout</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bets.map((bet) => (
            <TableRow key={bet.id}>
              <TableCell className="text-xs">
                <div className="text-[var(--text-primary)]">{bet.eventId.slice(0, 8)}...</div>
                <div className="text-[var(--text-tertiary)]">{bet.chain}</div>
              </TableCell>
              <TableCell className="text-xs capitalize">{bet.selection}</TableCell>
              <TableCell className="text-xs font-mono">
                {bet.stake} {bet.chain === 'solana' ? 'lamports' : 'wei'}
              </TableCell>
              <TableCell className="text-xs font-mono">{bet.oddsAtPlacement.toFixed(2)}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    bet.status === 'won'
                      ? 'default'
                      : bet.status === 'lost'
                      ? 'loss'
                      : bet.status === 'void'
                      ? 'secondary'
                      : 'outline'
                  }
                  className="text-[10px]"
                >
                  {bet.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-xs font-mono">
                {bet.payoutAmount ?? '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
