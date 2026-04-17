import { useState, useEffect } from "react"
import { useParams, useLocation, Link } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataCell } from "@/components/ui/data-cell"
import { AddressPill } from "@/components/ui/address-pill"
import { ChainChip } from "@/components/ui/chain-chip"
import { TradeModal } from "@/components/TradeModal"
import TokenChart from "@/components/TokenChart"
import { useAuth } from "@/lib/auth-context"
import { useChain } from "@/lib/chain-context"
import { ArrowLeft, ExternalLink } from "lucide-react"
import {
  formatTokenAmount,
  toBigInt,
  formatUSD,
  formatCompactNumber,
} from "@/lib/token-format"
import type { Token, Position } from "@shared/schema"
import { cn } from "@/lib/utils"

function getExplorerUrl(chain: string, tokenAddress: string): string {
  if (chain === "base") return `https://basescan.org/token/${tokenAddress}`
  if (chain === "solana") return `https://solscan.io/token/${tokenAddress}`
  return `https://dexscreener.com/${chain}/${tokenAddress}`
}

export default function TokenPage() {
  const params = useParams()
  const tokenAddress = params.address
  const [, setLocation] = useLocation()
  const { isAuthenticated } = useAuth()
  const { activeChain } = useChain()

  const [showModal, setShowModal] = useState(false)
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy")

  const {
    data: tokenData,
    isLoading: tokenLoading,
    error: tokenError,
  } = useQuery<Token & { cached?: boolean; ageMs?: number }>({
    queryKey: [`/api/market/token/${tokenAddress}`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/market/token/${tokenAddress}?chain=${activeChain}`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch token")
      return res.json()
    },
    enabled: !!tokenAddress,
    refetchInterval: 5000,
    retry: 3,
  })

  const { data: positionsData } = useQuery<{ positions: Position[] }>({
    queryKey: ["/api/trades/positions", activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/trades/positions?chain=${activeChain}`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch positions")
      return res.json()
    },
    enabled: isAuthenticated,
  })

  const userPosition = positionsData?.positions?.find(
    (p) => p.tokenAddress === tokenAddress
  )

  const openTradeModal = (mode: "buy" | "sell") => {
    setTradeMode(mode)
    setShowModal(true)
  }

  if (tokenError || (!tokenData && !tokenLoading)) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
            Back
          </Button>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-8 text-center">
            <h1 className="text-h2 mb-2">Token Not Found</h1>
            <p className="text-body text-[var(--text-secondary)] mb-6">
              Could not load token data. It may be too new or not yet indexed.
            </p>
            <AddressPill address={tokenAddress || ""} />
          </div>
        </div>
      </div>
    )
  }

  if (!tokenData && tokenLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-8 text-center">
            <div className="skeleton-shimmer h-8 w-48 mx-auto rounded mb-4" />
            <div className="skeleton-shimmer h-4 w-32 mx-auto rounded" />
          </div>
        </div>
      </div>
    )
  }

  const token = tokenData!
  const hasValidPrice = token.price && !isNaN(token.price) && isFinite(token.price) && token.price > 0

  if (!hasValidPrice) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
            Back
          </Button>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-8 text-center">
            <h1 className="text-h2 mb-2">{token.name}</h1>
            <Badge variant="outline" className="mb-4">{token.symbol}</Badge>
            <p className="text-body text-[var(--text-secondary)] mb-4">
              Price data is currently unavailable for this token.
            </p>
            <AddressPill address={tokenAddress || ""} />
          </div>
        </div>
      </div>
    )
  }

  const priceUsd =
    token.priceUsd !== undefined
      ? token.priceUsd
      : token.price
      ? token.price / 1_000_000_000
      : 0

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-20 lg:pb-0">
      <div className="mx-auto max-w-content px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.5} />
            Back
          </Button>

          <div className="flex items-start gap-4 flex-wrap">
            {token.icon && (
              <img
                src={token.icon}
                alt={token.symbol}
                className="h-14 w-14 rounded-lg object-cover shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-h1">{token.name}</h1>
                <Badge variant="outline">{token.symbol}</Badge>
                <ChainChip chain={activeChain} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <AddressPill address={tokenAddress || ""} />
                <a
                  href={getExplorerUrl(activeChain, tokenAddress!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Data Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Price</p>
            <DataCell
              value={priceUsd < 0.01 && priceUsd > 0 ? `$${priceUsd.toExponential(2)}` : `$${priceUsd.toFixed(4)}`}
              variant={token.priceChange24h && token.priceChange24h >= 0 ? "gain" : token.priceChange24h && token.priceChange24h < 0 ? "loss" : "default"}
            />
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">24h Change</p>
            <DataCell
              value={`${token.priceChange24h && token.priceChange24h >= 0 ? "+" : ""}${(token.priceChange24h || 0).toFixed(2)}%`}
              variant={token.priceChange24h && token.priceChange24h >= 0 ? "gain" : "loss"}
            />
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Market Cap</p>
            <DataCell value={formatCompactNumber(token.marketCap || 0)} />
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-4">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Volume (24h)</p>
            <DataCell value={formatCompactNumber(token.volume24h || 0)} />
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <div className="lg:col-span-2">
            <TokenChart
              tokenAddress={tokenAddress!}
              tokenSymbol={token.symbol}
              tokenName={token.name}
              currentPrice={priceUsd}
              priceChange24h={token.priceChange24h || 0}
              volume24h={token.volume24h || 0}
              height="480px"
              chain={activeChain}
            />
          </div>

          {/* Trade Panel */}
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5">
              <div className="flex gap-3 mb-5">
                <Button
                  className="flex-1"
                  onClick={() => openTradeModal("buy")}
                >
                  Buy {token.symbol}
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => openTradeModal("sell")}
                  disabled={!userPosition}
                >
                  Sell {token.symbol}
                </Button>
              </div>

              {userPosition && (
                <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
                  <p className="text-small text-[var(--text-tertiary)] uppercase tracking-wider">
                    Your Position
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Amount</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {formatTokenAmount(userPosition.amount, 2, userPosition.decimals || token.decimals || 6)} {token.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Entry</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {formatUSD(userPosition.entryPrice, 6)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Value</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {(() => {
                        try {
                          const amount = toBigInt(userPosition.amount)
                          const price = Number(token.price)
                          if (!isFinite(price) || price <= 0) return "$0.00"
                          const decimals = userPosition.decimals || 6
                          const valueLamports = (amount * BigInt(Math.floor(price))) / BigInt(10 ** decimals)
                          return formatUSD(valueLamports, 2)
                        } catch {
                          return "$0.00"
                        }
                      })()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trade Modal */}
      {showModal && (
        <TradeModal
          token={tradeMode === "buy" ? token : undefined}
          position={
            tradeMode === "sell" && userPosition
              ? userPosition
              : undefined
          }
          mode={tradeMode}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
