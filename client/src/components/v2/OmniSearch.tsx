import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2 } from "lucide-react";

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  icon?: string;
  marketCap?: number;
}

function formatMarketCap(m?: number) {
  if (!m || m <= 0) return null;
  if (m >= 1_000_000_000) return `${(m / 1_000_000_000).toFixed(2)}B`;
  if (m >= 1_000_000) return `${(m / 1_000_000).toFixed(2)}M`;
  if (m >= 1_000) return `${(m / 1_000).toFixed(1)}K`;
  return `${Math.floor(m)}`;
}

export function OmniSearch() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounce query
  const debounced = useMemo(() => {
    const q = query.trim();
    return q.length >= 3 ? q : "";
  }, [query]);

  const { data, isLoading } = useQuery<{ results: SearchResult[] }>({
    queryKey: ["/api/market/search", debounced],
    enabled: open && debounced.length >= 3,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/market/search?q=${encodeURIComponent(debounced)}`, { credentials: "include" });
      if (!res.ok) {
        toast({
          title: "Search failed",
          description: "Could not search tokens. Please try again.",
          variant: "destructive",
        });
        throw new Error("Search failed");
      }
      return res.json();
    },
  });

  const results = data?.results || [];

  const onSelect = (address: string) => {
    setOpen(false);
    setQuery("");
    setLocation(`/token/${address}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-full border bg-background/60 px-3 py-2 text-sm text-muted-foreground hover:bg-background/80 transition"
        data-testid="button-omni-search"
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
        <span className="truncate">Search tokens…</span>
        <span className="ml-2 rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">Ctrl K</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 sm:max-w-2xl" aria-describedby="omni-search-description">
          <div id="omni-search-description" className="sr-only">
            Search tokens and navigate quickly.
          </div>

          <Command className="w-full">
            <div className="border-b p-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by token name, symbol, or address…"
                  className="h-10 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  data-testid="input-omni-search"
                />
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Type at least 3 characters. Press Esc to close.
              </p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {query.trim().length > 0 && query.trim().length < 3 ? (
                <Card className="p-4 text-sm text-muted-foreground">
                  Keep typing, minimum 3 characters.
                </Card>
              ) : null}

              {!isLoading && debounced && results.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground">
                  No tokens found for “{debounced}”.
                </Card>
              ) : null}

              {results.map((r) => (
                <button
                  key={r.tokenAddress}
                  type="button"
                  onClick={() => onSelect(r.tokenAddress)}
                  className="w-full text-left rounded-lg p-3 hover:bg-muted/60 transition flex items-center gap-3"
                  data-testid={`omni-result-${r.tokenAddress}`}
                >
                  {r.icon ? (
                    <img
                      src={r.icon}
                      alt={r.symbol}
                      className="h-9 w-9 rounded-full shrink-0"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold truncate">{r.name}</div>
                      <Badge variant="outline" className="text-[11px]">{r.symbol}</Badge>
                      {r.marketCap ? (
                        <span className="ml-auto text-xs text-muted-foreground font-mono">
                          ${formatMarketCap(r.marketCap)}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {r.tokenAddress}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
