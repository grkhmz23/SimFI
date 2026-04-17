import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(245,243,238,0.08)]",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[hsl(240_4%_14%)] text-[var(--text-primary)]",
        secondary:
          "border-transparent bg-[hsl(240_4%_14%)] text-[var(--text-secondary)]",
        outline:
          "border-[var(--border-subtle)] text-[var(--text-secondary)]",
        gain:
          "border-[rgba(63,168,118,0.25)] bg-[rgba(63,168,118,0.15)] text-[var(--accent-gain)]",
        loss:
          "border-[rgba(194,77,77,0.25)] bg-[rgba(194,77,77,0.15)] text-[var(--accent-loss)]",
        premium:
          "border-[rgba(201,169,110,0.25)] bg-[rgba(201,169,110,0.15)] text-[var(--accent-premium)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
