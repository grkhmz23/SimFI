import * as React from "react"
import { cn } from "@/lib/utils"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"
import { formatPct } from "@/lib/format"

interface DataCellProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: string | number
  variant?: "default" | "gain" | "loss" | "premium" | "secondary" | "tertiary"
  diff?: number
  prefix?: string
  suffix?: string
  mono?: boolean
}

const DataCell = React.forwardRef<HTMLSpanElement, DataCellProps>(
  ({ className, value, variant = "default", diff, prefix, suffix, mono = true, ...props }, ref) => {
    const colorClass =
      variant === "gain"
        ? "text-[var(--accent-gain)]"
        : variant === "loss"
        ? "text-[var(--accent-loss)]"
        : variant === "premium"
        ? "text-[var(--accent-premium)]"
        : variant === "secondary"
        ? "text-[var(--text-secondary)]"
        : variant === "tertiary"
        ? "text-[var(--text-tertiary)]"
        : "text-[var(--text-primary)]"

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 tabular-nums",
          mono && "font-mono",
          colorClass,
          className
        )}
        {...props}
      >
        {prefix}
        {value}
        {suffix}
        {diff !== undefined && diff !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs",
              diff > 0 ? "text-[var(--accent-gain)]" : "text-[var(--accent-loss)]"
            )}
          >
            {diff > 0 ? (
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
            ) : (
              <ArrowDownRight className="h-3 w-3" strokeWidth={1.5} />
            )}
            {formatPct(diff)}
          </span>
        )}
      </span>
    )
  }
)
DataCell.displayName = "DataCell"

export { DataCell }
