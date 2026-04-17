import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-[var(--border-subtle)] bg-[hsl(240_4%_12%)] px-3 py-2 text-sm text-[var(--text-primary)] ring-offset-transparent placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[rgba(245,243,238,0.08)] disabled:cursor-not-allowed disabled:opacity-50 resize-y",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
