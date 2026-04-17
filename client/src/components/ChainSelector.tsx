import { useChain } from '@/lib/chain-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ChevronDown, Circle } from 'lucide-react';

interface ChainSelectorProps {
  variant?: 'default' | 'compact' | 'pill';
  className?: string;
}

export function ChainSelector({ variant = 'default', className }: ChainSelectorProps) {
  const { activeChain, setActiveChain, isBase, isSolana, nativeSymbol } = useChain();

  const chains = [
    {
      id: 'base' as const,
      name: 'Base',
      symbol: 'ETH',
      color: 'bg-blue-500',
      description: 'Base Chain',
    },
    {
      id: 'solana' as const,
      name: 'Solana',
      symbol: 'SOL',
      color: 'bg-purple-500',
      description: 'Solana Chain',
    },
  ];

  const activeChainData = chains.find((c) => c.id === activeChain);

  if (variant === 'compact') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-2 gap-1.5 text-xs font-medium',
              isBase && 'text-blue-400 hover:text-blue-300',
              isSolana && 'text-purple-400 hover:text-purple-300',
              className
            )}
          >
            <Circle className={cn('w-2 h-2 fill-current', activeChainData?.color)} />
            {nativeSymbol}
            <ChevronDown className="w-3 h-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {chains.map((chain) => (
            <DropdownMenuItem
              key={chain.id}
              onClick={() => setActiveChain(chain.id)}
              className={cn(
                'flex items-center gap-2 cursor-pointer',
                activeChain === chain.id && 'bg-accent'
              )}
            >
              <Circle className={cn('w-2 h-2 fill-current', chain.color)} />
              <span className="flex-1">{chain.name}</span>
              <span className="text-xs text-muted-foreground">{chain.symbol}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === 'pill') {
    return (
      <div className={cn(
        'inline-flex items-center rounded-full p-1 bg-muted/50 border border-border/50',
        className
      )}>
        {chains.map((chain) => (
          <button
            key={chain.id}
            onClick={() => setActiveChain(chain.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
              activeChain === chain.id
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Circle className={cn('w-2 h-2 fill-current', chain.color)} />
            {chain.name}
          </button>
        ))}
      </div>
    );
  }

  // Default variant
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'gap-2 min-w-[140px] justify-between',
            isBase && 'border-blue-500/30 hover:border-blue-500/50',
            isSolana && 'border-purple-500/30 hover:border-purple-500/50',
            className
          )}
        >
          <span className="flex items-center gap-2">
            <Circle className={cn('w-2.5 h-2.5 fill-current', activeChainData?.color)} />
            {activeChainData?.name}
          </span>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {chains.map((chain) => (
          <DropdownMenuItem
            key={chain.id}
            onClick={() => setActiveChain(chain.id)}
            className={cn(
              'flex items-center gap-3 cursor-pointer py-2.5',
              activeChain === chain.id && 'bg-accent'
            )}
          >
            <Circle className={cn('w-2.5 h-2.5 fill-current', chain.color)} />
            <div className="flex flex-col">
              <span className="font-medium">{chain.name}</span>
              <span className="text-xs text-muted-foreground">{chain.description}</span>
            </div>
            {activeChain === chain.id && (
              <span className="ml-auto text-xs text-muted-foreground">Active</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Simple chain badge for inline display
export function ChainBadge({ chain, className }: { chain?: 'base' | 'solana'; className?: string }) {
  const { activeChain, isBase } = useChain();
  const displayChain = chain || activeChain;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        displayChain === 'base'
          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
          : 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
        className
      )}
    >
      <Circle
        className={cn(
          'w-1.5 h-1.5 fill-current',
          displayChain === 'base' ? 'text-blue-500' : 'text-purple-500'
        )}
      />
      {displayChain === 'base' ? 'Base' : 'Solana'}
    </span>
  );
}
