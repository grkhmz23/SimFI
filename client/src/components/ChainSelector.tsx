// client/src/components/ChainSelector.tsx
// Chain selector dropdown for multi-chain support

import { useChain, CHAINS, CHAIN_CONFIG, type Chain } from '@/lib/chain-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ChainSelectorProps {
  className?: string;
  showLabel?: boolean;
}

const chainIcons: Record<Chain, React.ReactNode> = {
  solana: (
    <svg className="w-4 h-4" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M108.5 72.5L93.5 87.5H34.5L19.5 72.5L34.5 57.5H93.5L108.5 72.5Z" fill="url(#solana-gradient)"/>
      <path d="M108.5 42.5L93.5 57.5H34.5L19.5 42.5L34.5 27.5H93.5L108.5 42.5Z" fill="url(#solana-gradient)"/>
      <path d="M108.5 102.5L93.5 117.5H34.5L19.5 102.5L34.5 87.5H93.5L108.5 102.5Z" fill="url(#solana-gradient)"/>
      <defs>
        <linearGradient id="solana-gradient" x1="19.5" y1="27.5" x2="108.5" y2="117.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF"/>
          <stop offset="0.5" stopColor="#8752F3"/>
          <stop offset="1" stopColor="#19FB9B"/>
        </linearGradient>
      </defs>
    </svg>
  ),
  base: (
    <svg className="w-4 h-4" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/>
      <path d="M55.5 92C75.5 92 92 75.5 92 55.5C92 35.5 75.5 19 55.5 19C36.5 19 21 32.5 19 51H65.5V60H19C21 78.5 36.5 92 55.5 92Z" fill="white"/>
    </svg>
  ),
};

export function ChainSelector({ className, showLabel = true }: ChainSelectorProps) {
  const { chain, setChain, config } = useChain();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex items-center gap-2 h-9 px-3 border-border/60 bg-background/50 hover:bg-accent",
            className
          )}
        >
          {chainIcons[chain]}
          {showLabel && (
            <span className="font-medium text-sm">{config.name}</span>
          )}
          <svg
            className="w-3 h-3 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {CHAINS.map((c) => (
          <DropdownMenuItem
            key={c}
            onClick={() => setChain(c)}
            className={cn(
              "flex items-center gap-2 cursor-pointer",
              chain === c && "bg-accent"
            )}
          >
            {chainIcons[c]}
            <div className="flex flex-col">
              <span className="font-medium">{CHAIN_CONFIG[c].name}</span>
              <span className="text-xs text-muted-foreground">
                {CHAIN_CONFIG[c].nativeSymbol}
              </span>
            </div>
            {chain === c && (
              <svg className="w-4 h-4 ml-auto text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Compact chain badge for display in lists
 */
export function ChainBadge({ chain, className }: { chain: Chain; className?: string }) {
  const config = CHAIN_CONFIG[chain];
  
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
        chain === 'solana' && "bg-purple-500/10 text-purple-500 border border-purple-500/20",
        chain === 'base' && "bg-blue-500/10 text-blue-500 border border-blue-500/20",
        className
      )}
    >
      {chainIcons[chain]}
      {config.name}
    </span>
  );
}

/**
 * Chain icon only (for tight spaces)
 */
export function ChainIcon({ chain, className }: { chain: Chain; className?: string }) {
  return (
    <span className={cn("inline-flex", className)} title={CHAIN_CONFIG[chain].name}>
      {chainIcons[chain]}
    </span>
  );
}
