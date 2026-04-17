import * as React from "react"
import { cn } from "@/lib/utils"

interface ChainChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  chain: "base" | "solana"
}

const ChainChip = React.forwardRef<HTMLSpanElement, ChainChipProps>(
  ({ className, chain, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "chain-chip",
          chain === "base" ? "chain-chip-base" : "chain-chip-solana",
          className
        )}
        {...props}
      >
        {chain === "base" ? "Base" : "Solana"}
      </span>
    )
  }
)
ChainChip.displayName = "ChainChip"

export { ChainChip }
