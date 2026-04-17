import * as React from "react"
import { cn } from "@/lib/utils"
import { Copy, Check } from "lucide-react"

interface AddressPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  address: string
  truncate?: "start" | "middle" | "end"
  chars?: number
  showCopy?: boolean
}

function formatAddress(address: string, truncate: "start" | "middle" | "end", chars: number): string {
  if (address.length <= chars * 2 + 2) return address
  if (truncate === "start") return `...${address.slice(-chars)}`
  if (truncate === "end") return `${address.slice(0, chars)}...`
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

const AddressPill = React.forwardRef<HTMLSpanElement, AddressPillProps>(
  ({ className, address, truncate = "middle", chars = 4, showCopy = true, ...props }, ref) => {
    const [copied, setCopied] = React.useState(false)

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(address)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // ignore
      }
    }

    return (
      <span
        ref={ref}
        className={cn(
          "address-pill cursor-pointer transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]",
          className
        )}
        onClick={handleCopy}
        title={address}
        {...props}
      >
        <span className="truncate">{formatAddress(address, truncate, chars)}</span>
        {showCopy && (
          <span className="shrink-0 text-[var(--text-tertiary)]">
            {copied ? (
              <Check className="h-3 w-3 text-[var(--accent-gain)]" strokeWidth={1.5} />
            ) : (
              <Copy className="h-3 w-3" strokeWidth={1.5} />
            )}
          </span>
        )}
      </span>
    )
  }
)
AddressPill.displayName = "AddressPill"

export { AddressPill }
