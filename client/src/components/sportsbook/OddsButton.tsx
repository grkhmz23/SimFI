import { cn } from "@/lib/utils";

interface OddsButtonProps {
  label: string;
  odds: number;
  onClick: () => void;
  className?: string;
}

export function OddsButton({ label, odds, onClick, className }: OddsButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between px-3 py-2 rounded-md border border-[var(--border-subtle)]",
        "bg-[var(--bg-raised)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-strong)]",
        "transition-colors cursor-pointer",
        className
      )}
    >
      <span className="text-xs text-[var(--text-secondary)] truncate mr-2">{label}</span>
      <span className="text-sm font-mono font-semibold text-[var(--accent-gain)]">
        {odds.toFixed(2)}
      </span>
    </button>
  );
}
