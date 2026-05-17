import { useState, useMemo } from "react"
import { useLocation } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { useChain } from "@/lib/chain-context"
import { useAuth } from "@/lib/auth-context"
import { usePrice } from "@/lib/price-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ChainChip } from "@/components/ui/chain-chip"
import { TradeModal } from "@/components/TradeModal"
import TokenChart from "@/components/TokenChart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  TrendingUp,
  Flame,
  Sparkles,
  ArrowRight,
  Search,
  RefreshCw,
  AlertCircle,
  LogIn,
  Wallet,
  History,
} from "lucide-react"
import {
  formatMarketCap,
  toBigInt,
  lamportsToSol,
  weiToEth,
} from "@/lib/token-format"
import { formatUsdText, formatPct, formatNative, formatTokenQty } from "@/lib/format"
import type { Token, Position, Trade } from "@shared/schema"
import { cn } from "@/lib/utils"

// ─── helpers ─────────────────────────────────────────────────────────────────

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

interface EnrichedPosition extends Position {
  currentPrice: string
  currentValue: string
}

// ─── PositionSummary ──────────────────────────────────────────────────────────

function PositionSummary({
  position,
  chain,
  nativePriceUSD,
}: {
  position: EnrichedPosition
  chain: "solana" | "base"
  nativePriceUSD: number | null
}) {
  const spent = toBigInt(position.solSpent)
  const currentVal = toBigInt(position.currentValue)
  const pnl = currentVal - spent

  const toNative = (v: bigint) =>
    chain === "solana" ? lamportsToSol(v) : weiToEth(v)

  const spentNative = toNative(spent)
  const currentNative = toNative(currentVal)
  const pnlNative = toNative(pnl)

  const isGain = pnl >= 0n
  const pnlPct = spentNative !== 0 ? (pnlNative / spentNative) * 100 : 0

  const _decimals = position.decimals ?? 6
  const _amtBig = toBigInt(position.amount)
  const _decBig = BigInt(10 ** _decimals)
  const tokenQty = formatTokenQty(
    Number(_amtBig / _decBig) + Number(_amtBig % _decBig) / 10 ** _decimals,
  )

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          Open Position
        </span>
        <Badge variant={isGain ? "gain" : "loss"} className="text-[10px] px-1.5 h-4">
          {isGain ? "+" : ""}
          {formatPct(pnlPct)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <p className="text-[var(--text-tertiary)] mb-0.5">Holdings</p>
          <p className="font-mono text-[var(--text-primary)]">
            {tokenQty} {position.tokenSymbol}
          </p>
        </div>
        <div>
          <p className="text-[var(--text-tertiary)] mb-0.5">Value</p>
          <p className="font-mono text-[var(--text-primary)]">
            {nativePriceUSD != null
              ? formatUsdText(currentNative * nativePriceUSD)
              : formatNative(currentNative, chain)}
          </p>
        </div>
        <div>
          <p className="text-[var(--text-tertiary)] mb-0.5">Invested</p>
          <p className="font-mono text-[var(--text-secondary)]">
            {formatNative(spentNative, chain)}
          </p>
        </div>
        <div>
          <p className="text-[var(--text-tertiary)] mb-0.5">P&amp;L</p>
          <p
            className={cn(
              "font-mono",
              isGain ? "text-[var(--accent-gain)]" : "text-[var(--accent-loss)]",
            )}
          >
            {isGain ? "+" : ""}
            {nativePriceUSD != null
              ? formatUsdText(pnlNative * nativePriceUSD)
              : formatNative(pnlNative, chain)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── OrderPanel ───────────────────────────────────────────────────────────────

function OrderPanel({
  token,
  position,
  positionLoading,
  chain,
  nativePriceUSD,
  balanceNative,
  onBuy,
  onSell,
  isAuthenticated,
  onLogin,
}: {
  token: Token
  position: EnrichedPosition | null
  positionLoading: boolean
  chain: "solana" | "base"
  nativePriceUSD: number | null
  balanceNative: number
  onBuy: () => void
  onSell: () => void
  isAuthenticated: boolean
  onLogin: () => void
}) {
  const displayPrice =
    token.priceUsd !== undefined
      ? formatUsdText(token.priceUsd)
      : token.price
      ? formatUsdText(
          (token.price / (chain === "base" ? 1e18 : 1e9)) * (nativePriceUSD ?? 0),
        )
      : "—"

  return (
    <div className="flex flex-col gap-3">
      {/* Token quick summary */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-medium text-[var(--text-primary)] truncate leading-tight">
              {token.name}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{token.symbol}</p>
          </div>
          <ChainChip chain={chain} />
        </div>

        <div className="mb-3">
          <p className="text-xl font-mono font-medium text-[var(--text-primary)]">
            {displayPrice}
          </p>
          {token.priceChange24h !== undefined && (
            <span
              className={cn(
                "text-xs font-mono",
                token.priceChange24h >= 0
                  ? "text-[var(--accent-gain)]"
                  : "text-[var(--accent-loss)]",
              )}
            >
              {formatPct(token.priceChange24h)} 24h
            </span>
          )}
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] mb-3">
            <Wallet className="h-3 w-3 shrink-0" />
            <span>
              {formatNative(balanceNative, chain)} available
            </span>
          </div>
        )}

        {/* Actions */}
        {isAuthenticated ? (
          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              onClick={onBuy}
              aria-label={`Review buy order for ${token.symbol}`}
            >
              Review Buy
            </Button>
            {position && (
              <Button
                variant="danger"
                className="w-full"
                onClick={onSell}
                aria-label={`Review sell order for ${token.symbol}`}
              >
                Review Sell
              </Button>
            )}
          </div>
        ) : (
          <Button className="w-full" onClick={onLogin}>
            <LogIn className="h-4 w-4 mr-2" />
            Login to Trade
          </Button>
        )}
      </div>

      {/* Position block */}
      {isAuthenticated && (
        <>
          {positionLoading ? (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : position ? (
            <PositionSummary
              position={position}
              chain={chain}
              nativePriceUSD={nativePriceUSD}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-4 text-center">
              <p className="text-xs text-[var(--text-tertiary)]">
                No open position in {token.symbol}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── RecentTradesPreview ──────────────────────────────────────────────────────

function RecentTradesPreview({
  tokenAddress,
  chain,
  nativePriceUSD,
}: {
  tokenAddress: string
  chain: "solana" | "base"
  nativePriceUSD: number | null
}) {
  const { data, isLoading } = useQuery<{ trades: Trade[] }>({
    queryKey: ["/api/trades/history", chain, tokenAddress],
    queryFn: async () => {
      const res = await fetch(
        `/api/trades/history?chain=${chain}&tokenAddress=${encodeURIComponent(tokenAddress)}&limit=5`,
        { credentials: "include" },
      )
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    staleTime: 30_000,
  })

  const trades = data?.trades ?? []

  if (!isLoading && trades.length === 0) return null

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        <p className="text-xs font-medium text-[var(--text-secondary)]">Recent Trades</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {trades.map((trade) => {
            const pl = toBigInt(trade.profitLoss)
            const spent = toBigInt(trade.solSpent)
            const isGain = pl >= 0n
            const toNative = (v: bigint) =>
              chain === "solana" ? lamportsToSol(v) : weiToEth(v)
            const plNative = toNative(pl)
            const plPct100 = spent === 0n ? 0n : (pl * 10000n) / spent
            const plPct = Number(plPct100) / 100

            const closedDate = new Date(trade.closedAt)
            const dateStr = closedDate.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })

            return (
              <div
                key={trade.id}
                className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--border-subtle)] last:border-0"
              >
                <span className="text-[var(--text-tertiary)]">{dateStr}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-mono",
                      isGain ? "text-[var(--accent-gain)]" : "text-[var(--accent-loss)]",
                    )}
                  >
                    {isGain ? "+" : ""}
                    {nativePriceUSD != null
                      ? formatUsdText(plNative * nativePriceUSD)
                      : formatNative(plNative, chain)}
                  </span>
                  <Badge
                    variant={isGain ? "gain" : "loss"}
                    className="text-[10px] px-1 h-4"
                  >
                    {formatPct(plPct)}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── TradePage ────────────────────────────────────────────────────────────────

export default function TradePage() {
  const [, setLocation] = useLocation()
  const { activeChain } = useChain()
  const { isAuthenticated, getBalance } = useAuth()
  const { getPrice } = usePrice()

  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [listType, setListType] = useState<ListType>("trending")
  const [search, setSearch] = useState("")
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy")
  const [showModal, setShowModal] = useState(false)

  // Prices
  const nativePriceUSD = getPrice(activeChain) ?? null

  // Balance — bigint safe
  const balanceBigInt = getBalance(activeChain)
  const balanceNative =
    activeChain === "solana" ? lamportsToSol(balanceBigInt) : weiToEth(balanceBigInt)

  // Alpha Desk banner
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

  // Token list
  const {
    data,
    isLoading: isMarketLoading,
    isError: isMarketError,
    refetch: refetchMarket,
  } = useQuery<TokenListResponse>({
    queryKey: [`/api/market/${listType}`, activeChain],
    queryFn: async () => {
      let url = `/api/market/${listType}?chain=${activeChain}&limit=30`
      if (listType === "new-pairs") url += "&age=24"
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch tokens")
      return res.json()
    },
  })

  const rawTokens =
    listType === "trending"
      ? data?.trending
      : listType === "new-pairs"
      ? data?.newPairs
      : data?.hot

  const filteredTokens = useMemo(() => {
    if (!rawTokens) return []
    if (!search.trim()) return rawTokens
    const q = search.toLowerCase().trim()
    return rawTokens.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) || t.symbol?.toLowerCase().includes(q),
    )
  }, [rawTokens, search])

  // Open positions — only fetched when authenticated
  const { data: positionsData, isLoading: positionsLoading } = useQuery<{
    positions: EnrichedPosition[]
  }>({
    queryKey: ["/api/trades/positions", activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/trades/positions?chain=${activeChain}`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch positions")
      return res.json()
    },
    enabled: isAuthenticated,
    refetchInterval: 5000,
    staleTime: 2500,
  })

  const selectedPosition = useMemo(
    () =>
      selectedToken
        ? (positionsData?.positions?.find(
            (p) => p.tokenAddress === selectedToken.tokenAddress,
          ) ?? null)
        : null,
    [positionsData?.positions, selectedToken],
  )

  // Actions
  const openTrade = (mode: "buy" | "sell") => {
    setTradeMode(mode)
    setShowModal(true)
  }

  const tokenChain = selectedToken
    ? detectChainFromAddress(selectedToken.tokenAddress)
    : activeChain

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-20 lg:pb-0">
      <div className="mx-auto max-w-content px-4 sm:px-6 py-4 sm:py-6">
        {/*
          Layout:
          - Mobile: flex-col (DOM order = scanner → order panel → chart)
          - Desktop: 7-col grid using explicit col-start to place chart in center
            and order panel on the right, regardless of DOM order.
        */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-7 lg:gap-4 lg:h-[calc(100vh-100px)]">

          {/* ── SCANNER (desktop col 1-2) ───────────────────────────────── */}
          <div className="lg:col-start-1 lg:col-span-2 flex flex-col min-h-0 gap-2">

            {topPick && (
              <button
                onClick={() => setLocation("/alpha-desk")}
                className="flex items-center gap-3 rounded-lg border border-[var(--accent-premium)]/20 bg-[var(--accent-premium)]/5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--accent-premium)]/10 shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent-premium)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-[var(--accent-premium)] uppercase tracking-wider">
                    Alpha Pick
                  </p>
                  <p className="text-xs text-[var(--text-primary)] truncate">
                    {topPick.symbol} — {topPick.narrativeThesis}
                  </p>
                </div>
                <ArrowRight className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
              </button>
            )}

            <Tabs
              value={listType}
              onValueChange={(v) => {
                setListType(v as ListType)
                setSearch("")
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="trending" className="flex-1 gap-1">
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Trending
                </TabsTrigger>
                <TabsTrigger value="new-pairs" className="flex-1 gap-1">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                  New
                </TabsTrigger>
                <TabsTrigger value="hot" className="flex-1 gap-1">
                  <Flame className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Hot
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter tokens…"
                className="pl-8 h-8 text-xs bg-[var(--bg-raised)] border-[var(--border-subtle)]"
              />
            </div>

            {/* Token list */}
            <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-0">
              {isMarketLoading && (
                <div className="space-y-1.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2.5 rounded-md border border-[var(--border-subtle)]"
                    >
                      <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                      <Skeleton className="h-3.5 w-12" />
                    </div>
                  ))}
                </div>
              )}

              {isMarketError && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <AlertCircle className="h-7 w-7 text-[var(--text-tertiary)]" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    Failed to load tokens
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchMarket()}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Retry
                  </Button>
                </div>
              )}

              {!isMarketLoading && !isMarketError && filteredTokens.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {search.trim()
                      ? `No tokens matching "${search}"`
                      : "No tokens available"}
                  </p>
                </div>
              )}

              {!isMarketLoading && !isMarketError && filteredTokens.length > 0 && (
                <div className="space-y-0.5">
                  {filteredTokens.map((token) => {
                    const isSelected =
                      selectedToken?.tokenAddress === token.tokenAddress
                    const tokenDisplayPrice =
                      token.priceUsd !== undefined
                        ? formatUsdText(token.priceUsd)
                        : "—"

                    return (
                      <button
                        key={token.tokenAddress}
                        onClick={() => setSelectedToken(token)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors",
                          isSelected
                            ? "bg-[rgba(255,255,255,0.05)] border border-[var(--border-strong)]"
                            : "hover:bg-[rgba(255,255,255,0.02)] border border-transparent",
                        )}
                      >
                        {/* Icon */}
                        {token.icon ? (
                          <img
                            src={token.icon}
                            alt={token.symbol}
                            className="h-7 w-7 rounded-md object-cover shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-md bg-[var(--bg-base)] flex items-center justify-center text-[9px] font-bold text-[var(--text-tertiary)] shrink-0">
                            {token.symbol?.slice(0, 2) ?? "?"}
                          </div>
                        )}

                        {/* Name + stats */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5 min-w-0">
                            <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                              {token.name}
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
                              {token.symbol}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {token.marketCap
                                ? formatMarketCap(token.marketCap)
                                : "—"}
                            </span>
                            {token.priceChange24h !== undefined && (
                              <span
                                className={cn(
                                  "text-[10px] font-mono",
                                  token.priceChange24h >= 0
                                    ? "text-[var(--accent-gain)]"
                                    : "text-[var(--accent-loss)]",
                                )}
                              >
                                {formatPct(token.priceChange24h)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price */}
                        <span className="text-xs font-mono text-[var(--text-secondary)] shrink-0">
                          {tokenDisplayPrice}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── ORDER PANEL (DOM 2nd → mobile shows before chart) ──────── */}
          {/* Desktop: col 6-7 via grid placement */}
          <div className="lg:col-start-6 lg:col-span-2 flex flex-col gap-3 min-h-0 lg:overflow-y-auto">
            {selectedToken ? (
              <OrderPanel
                token={selectedToken}
                position={selectedPosition}
                positionLoading={isAuthenticated ? positionsLoading : false}
                chain={tokenChain}
                nativePriceUSD={nativePriceUSD}
                balanceNative={balanceNative}
                onBuy={() => openTrade("buy")}
                onSell={() => openTrade("sell")}
                isAuthenticated={isAuthenticated}
                onLogin={() => setLocation("/login")}
              />
            ) : (
              <div className="hidden lg:flex flex-1 items-start justify-center pt-8">
                <p className="text-xs text-[var(--text-tertiary)] text-center">
                  Select a token to place a trade
                </p>
              </div>
            )}
          </div>

          {/* ── CHART + TOKEN DETAIL (DOM 3rd → mobile below order panel) ── */}
          {/* Desktop: col 3-5 via grid placement */}
          <div className="lg:col-start-3 lg:col-span-3 flex flex-col gap-3 min-h-0 lg:overflow-y-auto">
            {selectedToken ? (
              <>
                {/* Token header */}
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-medium text-[var(--text-primary)]">
                          {selectedToken.name}
                        </h2>
                        <Badge variant="outline" className="text-xs">
                          {selectedToken.symbol}
                        </Badge>
                        <ChainChip chain={tokenChain} />
                      </div>
                      <p className="text-xl font-mono font-medium text-[var(--text-primary)] mt-1">
                        {selectedToken.priceUsd !== undefined
                          ? formatUsdText(selectedToken.priceUsd)
                          : "—"}
                        {selectedToken.priceChange24h !== undefined && (
                          <span
                            className={cn(
                              "ml-2 text-sm font-mono",
                              selectedToken.priceChange24h >= 0
                                ? "text-[var(--accent-gain)]"
                                : "text-[var(--accent-loss)]",
                            )}
                          >
                            {formatPct(selectedToken.priceChange24h)}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {selectedToken.marketCap ? (
                        <div>
                          <p className="text-[var(--text-tertiary)]">Mkt Cap</p>
                          <p className="font-mono text-[var(--text-primary)]">
                            {formatMarketCap(selectedToken.marketCap)}
                          </p>
                        </div>
                      ) : null}
                      {selectedToken.volume24h ? (
                        <div>
                          <p className="text-[var(--text-tertiary)]">Vol 24h</p>
                          <p className="font-mono text-[var(--text-primary)]">
                            {formatMarketCap(selectedToken.volume24h)}
                          </p>
                        </div>
                      ) : null}
                      {selectedToken.liquidity ? (
                        <div>
                          <p className="text-[var(--text-tertiary)]">Liquidity</p>
                          <p className="font-mono text-[var(--text-primary)]">
                            {formatMarketCap(selectedToken.liquidity)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Chart */}
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] overflow-hidden">
                  <TokenChart
                    tokenAddress={selectedToken.tokenAddress}
                    tokenSymbol={selectedToken.symbol}
                    tokenName={selectedToken.name}
                    currentPrice={
                      selectedToken.priceUsd !== undefined
                        ? selectedToken.priceUsd
                        : selectedToken.price
                        ? selectedToken.price /
                          (tokenChain === "base" ? 1e18 : 1e9)
                        : 0
                    }
                    priceChange24h={selectedToken.priceChange24h ?? 0}
                    volume24h={selectedToken.volume24h ?? 0}
                    height="300px"
                    chain={tokenChain}
                  />
                </div>

                {/* Recent trades for this token */}
                {isAuthenticated && (
                  <RecentTradesPreview
                    tokenAddress={selectedToken.tokenAddress}
                    chain={tokenChain}
                    nativePriceUSD={nativePriceUSD}
                  />
                )}
              </>
            ) : (
              /* Desktop empty state — hidden on mobile since scanner is visible */
              <div className="hidden lg:flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-raised)]">
                <div className="text-center px-6">
                  <TrendingUp
                    className="h-8 w-8 mx-auto text-[var(--text-tertiary)] mb-3"
                    strokeWidth={1.5}
                  />
                  <p className="text-sm text-[var(--text-secondary)] mb-1">
                    Select a token to view the chart
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Browse trending, new, or hot tokens in the scanner
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
