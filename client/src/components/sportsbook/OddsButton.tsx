import { cn } from "@/lib/utils";

interface OddsButtonProps {
  label: string;
  odds: number;
  onClick: () => void;
  selected?: boolean;
  className?: string;
}

export function OddsButton({ label, odds, onClick, selected, className }: OddsButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between px-3 py-2 rounded-md border transition-colors cursor-pointer",
        selected
          ? "border-[var(--accent-premium)] bg-[var(--accent-premium)]/10"
          : "border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-strong)]",
        className
      )}
    >
      <span className={cn(
        "text-xs truncate mr-2",
        selected ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"
      )}>
        {label}
      </span>
      <span className={cn(
        "text-sm font-mono font-semibold shrink-0",
        selected ? "text-[var(--accent-premium)]" : "text-[var(--accent-gain)]"
      )}>
        {odds.toFixed(2)}
      </span>
    </button>
  );
}
