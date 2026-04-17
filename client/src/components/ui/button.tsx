import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90",
        primary:
          "bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90",
        secondary:
          "bg-[hsl(240_4%_14%)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[rgba(255,255,255,0.03)]",
        ghost:
          "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.03)]",
        outline:
          "border border-[var(--border-subtle)] bg-transparent text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.03)]",
        danger:
          "bg-[rgba(194,77,77,0.15)] text-[var(--accent-loss)] border border-[rgba(194,77,77,0.25)] hover:bg-[rgba(194,77,77,0.25)]",
        destructive:
          "bg-[rgba(194,77,77,0.15)] text-[var(--accent-loss)] border border-[rgba(194,77,77,0.25)] hover:bg-[rgba(194,77,77,0.25)]",
        premium:
          "bg-[var(--accent-premium)] text-[var(--bg-base)] hover:brightness-110",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
