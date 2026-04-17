import { useState, useEffect, useCallback } from "react"
import { useLocation } from "wouter"
import { useChain } from "@/lib/chain-context"
import { useQuery } from "@tanstack/react-query"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command"
import { ChainChip } from "@/components/ui/chain-chip"
import { Search, Loader2, TrendingUp, Clock } from "lucide-react"
import { formatCompactNumber } from "@/lib/token-format"

interface SearchResult {
  tokenAddress: string
  name: string
  symbol: string
  icon?: string
  marketCap?: number
  priceChange24h?: number
  price?: number
}

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [, setLocation] = useLocation()
  const { activeChain } = useChain()
  const [query, setQuery] = useState("")
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  useEffect(() => {
    const saved = localStorage.getItem("simfi-recent-searches")
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved))
      } catch {
        // ignore
      }
    }
  }, [])

  const { data: searchResults, isLoading } = useQuery<{ results: SearchResult[] }>({
    queryKey: ["/api/market/search", query, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}&chain=${activeChain}`)
      if (!res.ok) throw new Error("Search failed")
      return res.json()
    },
    enabled: query.length >= 2,
    staleTime: 30000,
  })

  const handleSelect = useCallback(
    (address: string, name: string) => {
      setOpen(false)
      setQuery("")
      const updated = [name, ...recentSearches.filter((r) => r !== name)].slice(0, 5)
      setRecentSearches(updated)
      localStorage.setItem("simfi-recent-searches", JSON.stringify(updated))
      setLocation(`/token/${address}`)
    },
    [recentSearches, setLocation]
  )

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 h-9 px-3 rounded-md border border-[var(--border-subtle)] bg-[hsl(240_4%_12%)] text-[var(--text-secondary)] text-sm hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors min-w-[240px]"
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 text-left">Search tokens...</span>
        <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 font-mono text-[10px] font-medium text-[var(--text-tertiary)]">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <button
        onClick={() => setOpen(true)}
        className="md:hidden flex items-center justify-center h-9 w-9 rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        aria-label="Search"
      >
        <Search className="h-4 w-4" strokeWidth={1.5} />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search tokens by name or symbol..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {isLoading && query.length >= 2 && (
            <div className="py-8 flex items-center justify-center text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin mr-2" strokeWidth={1.5} />
              <span className="text-sm">Searching...</span>
            </div>
          )}

          {!isLoading && query.length >= 2 && (!searchResults?.results?.length) && (
            <CommandEmpty className="py-8 text-[var(--text-secondary)]">
              No tokens found for "{query}"
            </CommandEmpty>
          )}

          {!query && recentSearches.length > 0 && (
            <CommandGroup heading="Recent">
              {recentSearches.map((name) => (
                <CommandItem
                  key={name}
                  onSelect={() => setQuery(name)}
                  className="text-[var(--text-secondary)]"
                >
                  <Clock className="h-4 w-4 mr-2 shrink-0" strokeWidth={1.5} />
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {searchResults?.results && searchResults.results.length > 0 && (
            <CommandGroup heading={`Results on ${activeChain}`}>
              {searchResults.results.map((result) => (
                <CommandItem
                  key={result.tokenAddress}
                  onSelect={() => handleSelect(result.tokenAddress, result.name)}
                  className="flex items-center gap-3 py-2.5 cursor-pointer"
                >
                  {result.icon ? (
                    <img
                      src={result.icon}
                      alt={result.symbol}
                      className="h-7 w-7 rounded-md object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-md bg-[var(--bg-base)] flex items-center justify-center text-[10px] font-bold text-[var(--text-tertiary)] shrink-0">
                      {result.symbol?.slice(0, 2) || "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)] truncate">
                        {result.name}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {result.symbol}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                      {result.marketCap !== undefined && (
                        <span>MCap {formatCompactNumber(result.marketCap)}</span>
                      )}
                      {result.priceChange24h !== undefined && (
                        <span
                          className={
                            result.priceChange24h >= 0
                              ? "text-[var(--accent-gain)]"
                              : "text-[var(--accent-loss)]"
                          }
                        >
                          {result.priceChange24h >= 0 ? "+" : ""}
                          {result.priceChange24h.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <ChainChip chain={activeChain} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
