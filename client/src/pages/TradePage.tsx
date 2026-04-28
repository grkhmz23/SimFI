import { useState } from "react"
import { useLocation } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { useChain } from "@/lib/chain-context"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataCell } from "@/components/ui/data-cell"
import { Skeleton } from "@/components/ui/skeleton"
import { TradeModal } from "@/components/TradeModal"
import TokenChart from "@/components/TokenChart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TrendingUp, Flame, Sparkles, ArrowRight } from "lucide-react"
import { formatCompactNumber, formatMarketCap } from "@/lib/token-format"
import type { Token } from "@shared/schema"
import { cn } from "@/lib/utils"
import { formatUsdText, formatPct } from "@/lib/format"

// Detect chain from token address format
function detectChainFromAddress(address: string): "solana" | "base" {
  return address.startsWith("0x") ? "base" : "solana"
}

type ListType = "trending" | "new-pairs" | "hot"

interface TokenListResponse {
  trending?: Token[]
  newPairs?: Token[]
  hot?: Token[]
  count: number
  cachedAt: string
}

export default function TradePage() {
  const [, setLocation] = useLocation()
  const { activeChain } = useChain()
  const { isAuthenticated } = useAuth()
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [listType, setListType] = useState<ListType>("trending")
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy")
  const [showModal, setShowModal] = useState(false)

  const { data: alphaDeskData } = useQuery<{
    ideas: Array<{ symbol: string; tokenAddress: string; narrativeThesis: string }>
  }>({
    queryKey: [`/api/alpha-desk/today`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/alpha-desk/today?chain=${activeChain}`)
      if (!res.ok) return { ideas: [] }
      return res.json()
    },
  })

  const topPick = alphaDeskData?.ideas?.[0]

  const { data, isLoading } = useQuery<TokenListResponse>({
    queryKey: [`/api/market/${listType}`, activeChain],
    queryFn: async () => {
      let url = `/api/market/${listType}?chain=${activeChain}&limit=30`
      if (listType === "new-pairs") url += "&age=24"
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch tokens")
      return res.json()
    },
  })

  const tokens =
    listType === "trending"
      ? data?.trending
      : listType === "new-pairs"
      ? data?.newPairs
      : data?.hot

  const handleTokenClick = (token: Token) => {
    setSelectedToken(token)
  }

  const openTrade = (mode: "buy" | "sell") => {
    setTradeMode(mode)
    setShowModal(true)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-20 lg:pb-0">
      <div className="mx-auto max-w-content px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-120px)]">
          {/* Left: Token List */}
          <div className="lg:col-span-2 flex flex-col h-full overflow-hidden">
            {topPick && (
              <button
                onClick={() => setLocation("/alpha-desk")}
                className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--accent-premium)]/20 bg-[var(--accent-premium)]/5 px-4 py-3 text-left transition-colors hover:bg-[var(--accent-premium)]/10"
              >
                <Sparkles className="h-4 w-4 text-[var(--accent-premium)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--accent-premium)] uppercase tracking-wider">
                    Alpha Desk Pick
                  </p>
                  <p className="text-sm text-[var(--text-primary)] truncate">
                    {topPick.symbol} — {topPick.narrativeThesis}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] ml-auto shrink-0" />
              </button>
            )}
            <Tabs value={listType} onValueChange={(v) => setListType(v as ListType)} className="mb-4">
              <TabsList className="w-full">
                <TabsTrigger value="trending" className="flex-1 gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Trending
                </TabsTrigger>
                <TabsTrigger value="new-pairs" className="flex-1 gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                  New
                </TabsTrigger>
                <TabsTrigger value="hot" className="flex-1 gap-1.5">
                  <Flame className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Hot
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex-1 overflow-y-auto -mx-2 px-2">
              {isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-md border border-[var(--border-subtle)]"
                    >
                      <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && tokens && (
                <div className="space-y-1">
                  {tokens.map((token) => (
                    <button
                      key={token.tokenAddress}
                      onClick={() => handleTokenClick(token)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
                        selectedToken?.tokenAddress === token.tokenAddress
                          ? "bg-[rgba(255,255,255,0.03)] border border-[var(--border-strong)]"
                          : "hover:bg-[rgba(255,255,255,0.02)] border border-transparent"
                      )}
                    >
                      {token.icon ? (
                        <img
                          src={token.icon}
                          alt={token.symbol}
                          className="h-8 w-8 rounded-md object-cover shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-md bg-[var(--bg-base)] flex items-center justify-center text-[10px] font-bold text-[var(--text-tertiary)] shrink-0">
                          {token.symbol?.slice(0, 2) || "?"}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {token.name}
                          </span>
                          <span className="text-xs text-[var(--text-tertiary)] shrink-0">
                            {token.symbol}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-0.5">
                          <span className="text-[var(--text-tertiary)]">
                            {token.marketCap ? formatMarketCap(token.marketCap) : "—"}
                          </span>
                          {token.priceChange24h !== undefined && (
                            <span
                              className={cn(
                                "font-mono",
                                token.priceChange24h >= 0
                                  ? "text-[var(--accent-gain)]"
                                  : "text-[var(--accent-loss)]"
                              )}
                            >
                              {formatPct(token.priceChange24h)}
                            </span>
                          )}
                        </div>
                      </div>

                      <ArrowRight
                        className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0"
                        strokeWidth={1.5}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Chart + Trade */}
          <div className="lg:col-span-3 flex flex-col gap-4 h-full overflow-y-auto">
            {selectedToken ? (
              <>
                <TokenChart
                  tokenAddress={selectedToken.tokenAddress}
                  tokenSymbol={selectedToken.symbol}
                  tokenName={selectedToken.name}
                  currentPrice={
                    selectedToken.priceUsd !== undefined
                      ? selectedToken.priceUsd
                      : selectedToken.price
                      ? selectedToken.price / 1_000_000_000
                      : 0
                  }
                  priceChange24h={selectedToken.priceChange24h || 0}
                  volume24h={selectedToken.volume24h || 0}
                  chain={detectChainFromAddress(selectedToken.tokenAddress)}
                />

                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-medium">{selectedToken.name}</h3>
                      <p className="text-mono-sm text-[var(--text-secondary)]">
                        {selectedToken.priceUsd !== undefined
                          ? formatUsdText(selectedToken.priceUsd)
                          : formatCompactNumber(selectedToken.price || 0)}
                      </p>
                    </div>
                    <Badge variant="outline">{selectedToken.symbol}</Badge>
                  </div>

                  {isAuthenticated ? (
                    <div className="flex gap-3">
                      <Button className="flex-1" onClick={() => openTrade("buy")}>
                        Buy {selectedToken.symbol}
                      </Button>
                      <Button variant="danger" className="flex-1" onClick={() => openTrade("sell")}>
                        Sell {selectedToken.symbol}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Button className="flex-1" onClick={() => setLocation("/register")}>
                        Get Started
                      </Button>
                      <Button variant="secondary" className="flex-1" onClick={() => setLocation("/login")}>
                        Login
                      </Button>
                    </div>
                  )}

                  {/* RISK_SCORE_CARD_SLOT — future educational feature */}
                  <div className="mt-4 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 text-center">
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Risk analysis coming soon
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-raised)]">
                <div className="text-center">
                  <TrendingUp className="h-8 w-8 mx-auto text-[var(--text-tertiary)] mb-3" strokeWidth={1.5} />
                  <p className="text-sm text-[var(--text-secondary)]">
                    Select a token from the list to view the chart and trade
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && selectedToken && (
        <TradeModal
          token={selectedToken}
          mode={tradeMode}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
