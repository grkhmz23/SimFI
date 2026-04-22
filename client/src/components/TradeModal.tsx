import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useLocation } from "wouter"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useAuth } from "@/lib/auth-context"
import { apiRequest, queryClient } from "@/lib/queryClient"
import { useToast } from "@/hooks/use-toast"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { Token, Position } from "@shared/schema"
import { LogIn, Loader2, RefreshCw } from "lucide-react"
import {
  formatNativeAmount,
  toBigInt,
  formatTokenAmount,
  nativeToTokens,
  formatUSD,
  formatPricePerTokenNative,
} from "@/lib/token-format"
import { formatUsd, formatTokenQty, formatPct } from "@/lib/format"
import { useChain } from "@/lib/chain-context"
import { usePrice } from "@/lib/price-context"
import { cn } from "@/lib/utils"

interface TradeModalProps {
  token?: Token
  position?: Position & { currentPrice?: number | string | bigint }
  mode?: "buy" | "sell"
  onClose: () => void
}

const buySchema = z.object({
  amount: z.number().positive("Amount must be positive"),
})

const sellSchema = z.object({
  percentage: z.number().min(1).max(100),
})

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function TradeModal({ token, position, mode, onClose }: TradeModalProps) {
  const { user, isAuthenticated, refreshUser } = useAuth()
  const { toast } = useToast()
  const [, setLocation] = useLocation()
  const { activeChain, nativeSymbol, nativeDecimals } = useChain()
  const { getPrice } = usePrice()
  const nativePriceUSD = getPrice(activeChain) ?? 0
  const isBuying = mode === "buy" || !position
  const effectiveMode = mode || "buy"
  const [lastQuoteUpdate, setLastQuoteUpdate] = useState<Date>(new Date())

  const tokenAddress = position?.tokenAddress || token?.tokenAddress || ""

  const {
    data: freshToken,
    isLoading: isFetchingFreshToken,
  } = useQuery<Token>({
    queryKey: [`/api/market/token/${tokenAddress}`, activeChain],
    queryFn: async () => {
      const res = await fetch(`/api/market/token/${tokenAddress}?chain=${activeChain}`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch token")
      return res.json()
    },
    enabled: !!tokenAddress,
    staleTime: 0,
    refetchInterval: 2500,
    refetchOnMount: "always",
  })

  const activeToken =
    freshToken ||
    token ||
    (position
      ? ({
          tokenAddress: position.tokenAddress,
          name: position.tokenName,
          symbol: position.tokenSymbol,
          price: position.currentPrice || 0,
          priceUsd: nativePriceUSD > 0
            ? (Number(toBigInt(position.currentPrice || 0)) /
                (activeChain === 'solana' ? 1e9 : 1e18)) *
              nativePriceUSD
            : undefined,
          decimals: position.decimals || 6,
        } as Partial<Token>)
      : undefined)

  const currentPrice = toBigInt(
    (activeToken as any)?.priceLamports || activeToken?.price || 0
  )
  const currentPriceUsd = activeToken?.priceUsd

  // Compute USD display price from native units when priceUsd is unavailable
  const currentPriceNativeNum =
    Number(currentPrice) / (activeChain === 'solana' ? 1e9 : 1e18)
  const displayCurrentPriceUsd =
    currentPriceUsd ??
    (nativePriceUSD > 0 ? currentPriceNativeNum * nativePriceUSD : undefined)
  const symbol = position?.tokenSymbol || activeToken?.symbol || ""
  const name = position?.tokenName || activeToken?.name || ""

  if (!isAuthenticated) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <LogIn className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
              Login Required
            </DialogTitle>
            <DialogDescription>
              You need to be logged in to trade tokens
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-5 text-center">
              <p className="text-lg font-medium text-[var(--text-primary)] mb-1">{symbol}</p>
              <p className="text-sm text-[var(--text-secondary)] mb-4">{name}</p>
              <p className="text-2xl font-mono font-medium text-[var(--text-primary)]">
                {displayCurrentPriceUsd !== undefined
                  ? formatUsd(displayCurrentPriceUsd)
                  : formatPricePerTokenNative(currentPrice, activeChain)}
              </p>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => setLocation("/login")}>
                Login
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setLocation("/register")}>
                Register
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const buyForm = useForm<z.infer<typeof buySchema>>({
    resolver: zodResolver(buySchema),
    defaultValues: { amount: 0 },
  })

  const sellForm = useForm<z.infer<typeof sellSchema>>({
    resolver: zodResolver(sellSchema),
    defaultValues: { percentage: 100 },
  })

  const nativeAmount = buyForm.watch("amount") || 0
  const percentage = sellForm.watch("percentage") || 100
  const buyTokenDecimals = activeToken?.decimals || 6

  // Debounce amount for quote requests
  const [debouncedAmount, setDebouncedAmount] = useState(nativeAmount)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAmount(nativeAmount), 300)
    return () => clearTimeout(timer)
  }, [nativeAmount])

  const positionDecimals = position?.decimals || 6
  const sellAmountBigInt =
    !isBuying && position
      ? (toBigInt(position.amount) * BigInt(percentage)) / BigInt(100)
      : BigInt(0)

  // Server-authoritative quote
  const {
    data: quote,
    isLoading: isQuoting,
    error: quoteError,
  } = useQuery<{
    quoteId: string
    priceNative: string
    estimatedOutput: string
    expiresAt: number
    expiresInMs: number
    priceImpactBps: number
    nativeSymbol: string
  }>({
    queryKey: ["/api/quote", tokenAddress, activeChain, effectiveMode, isBuying ? debouncedAmount : percentage],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set("token", tokenAddress)
      params.set("chain", activeChain)
      params.set("side", effectiveMode)
      if (isBuying) {
        params.set("amountNative", debouncedAmount.toString())
      } else {
        params.set("amountTokens", sellAmountBigInt.toString())
      }
      const res = await fetch(`/api/quote?${params.toString()}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Quote failed")
      }
      return res.json()
    },
    enabled:
      !!tokenAddress &&
      isAuthenticated &&
      (isBuying ? debouncedAmount > 0 : sellAmountBigInt > 0n),
    refetchInterval: 5000,
    retry: 1,
  })

  useEffect(() => {
    if (quote) {
      setLastQuoteUpdate(new Date())
    }
  }, [quote])

  const currentPriceNumber = Number(currentPrice)
  const clientEstimatedTokens =
    isBuying && currentPriceNumber > 0 && isFinite(currentPriceNumber)
      ? (nativeAmount * 10 ** nativeDecimals) / currentPriceNumber
      : 0

  const tokenDecimals = position?.decimals || activeToken?.decimals || 6

  const estimatedTokens = isBuying && quote
    ? Number(quote.estimatedOutput) / 10 ** tokenDecimals
    : clientEstimatedTokens

  const sellValueBigInt = !isBuying && quote
    ? toBigInt(quote.estimatedOutput)
    : !isBuying
    ? (sellAmountBigInt * currentPrice) / BigInt(10) ** BigInt(tokenDecimals)
    : BigInt(0)

  const proportionalCostBigInt =
    !isBuying && position
      ? (toBigInt(position.solSpent) * BigInt(percentage)) / BigInt(100)
      : BigInt(0)

  const profitLossBigInt = !isBuying ? sellValueBigInt - proportionalCostBigInt : BigInt(0)

  const tradeMutation = useMutation({
    mutationFn: async (data: {
      side: "buy" | "sell"
      tokenAddress: string
      amountSol?: string
      amountTokens?: string
      positionId?: string
      tokenName?: string
      tokenSymbol?: string
    }) => {
      const idempotencyKey = generateIdempotencyKey()
      const headers = { "X-Idempotency-Key": idempotencyKey }

      if (data.side === "buy") {
        return apiRequest(
          "POST",
          "/api/trades/buy",
          {
            tokenAddress: data.tokenAddress,
            tokenName: data.tokenName,
            tokenSymbol: data.tokenSymbol,
            amount: data.amountSol,
            chain: activeChain,
          },
          headers
        )
      } else {
        return apiRequest(
          "POST",
          "/api/trades/sell",
          {
            positionId: data.positionId,
            amountLamports: data.amountTokens,
            chain: activeChain,
          },
          headers
        )
      }
    },
    onSuccess: async (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] })
      queryClient.invalidateQueries({ queryKey: ["/api/trades/positions", activeChain] })
      queryClient.invalidateQueries({ queryKey: ["/api/trades/history", activeChain] })
      await refreshUser()

      const decimals = token?.decimals || position?.decimals || 6
      toast({
        title: isBuying ? "Position Opened" : "Position Closed",
        description: isBuying
          ? `Bought ${formatTokenAmount(toBigInt(response.tokensReceived || 0), decimals, 2)} ${symbol} for ${nativeAmount} ${nativeSymbol}`
          : `Sold ${formatTokenAmount(sellAmountBigInt, decimals, 2)} ${symbol}`,
      })
      onClose()
    },
    onError: (error: any) => {
      toast({
        title: "Trade Failed",
        description: error.message || "Transaction failed",
        variant: "destructive",
      })
    },
  })

  const onBuySubmit = buyForm.handleSubmit((data) => {
    if (!activeToken || !tokenAddress) return
    const nativeSpentBigInt = BigInt(Math.floor(data.amount * 10 ** nativeDecimals))
    const userBalance = activeChain === "solana" ? user?.balance : user?.baseBalance
    const userBalanceBigInt = toBigInt(userBalance || 0)
    if (nativeSpentBigInt > userBalanceBigInt) {
      toast({
        title: "Insufficient Balance",
        description: `You need ${data.amount} ${nativeSymbol} but only have ${formatNativeAmount(userBalance || 0, activeChain)} ${nativeSymbol}`,
        variant: "destructive",
      })
      return
    }
    tradeMutation.mutate({
      side: "buy",
      tokenAddress,
      amountSol: data.amount.toString(),
      tokenName: activeToken.name || name,
      tokenSymbol: activeToken.symbol || symbol,
    })
  })

  const onSellSubmit = sellForm.handleSubmit((data) => {
    if (!position) return
    const sellAmountLamports = (toBigInt(position.amount) * BigInt(data.percentage)) / BigInt(100)
    tradeMutation.mutate({
      side: "sell",
      tokenAddress: position.tokenAddress,
      amountTokens: sellAmountLamports.toString(),
      positionId: position.id,
    })
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isBuying ? `Buy ${symbol}` : `Sell ${symbol}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isBuying
              ? `Buy ${symbol} tokens with ${nativeSymbol}`
              : `Sell ${symbol} tokens for ${nativeSymbol}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Price */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-[var(--text-tertiary)] text-sm mb-1">
              Current Price
              {isFetchingFreshToken && (
                <RefreshCw className="h-3 w-3 animate-spin" strokeWidth={1.5} />
              )}
            </div>
            {isFetchingFreshToken && !activeToken ? (
              <p className="text-mono-lg text-[var(--text-secondary)]">Loading...</p>
            ) : (
              <p className="text-mono-lg">
                {displayCurrentPriceUsd !== undefined
                  ? formatUsd(displayCurrentPriceUsd)
                  : formatPricePerTokenNative(currentPrice, activeChain)}
              </p>
            )}
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Server-authoritative pricing
            </p>
          </div>

          {isBuying ? (
            <Form {...buyForm}>
              <form onSubmit={onBuySubmit} className="space-y-4">
                <FormField
                  control={buyForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount ({nativeSymbol})</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.0"
                          className="font-mono"
                          disabled={tradeMutation.isPending}
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  {[0.1, 0.5, 1, 2, 5].map((amt) => (
                    <Button
                      key={amt}
                      type="button"
                      variant={nativeAmount === amt ? "default" : "secondary"}
                      size="sm"
                      className="flex-1"
                      onClick={() => buyForm.setValue("amount", amt)}
                      disabled={tradeMutation.isPending}
                    >
                      {amt}
                    </Button>
                  ))}
                </div>

                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Est. Tokens</span>
                    <span className="font-mono font-medium">
                      {isQuoting && debouncedAmount > 0 ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                          Quoting...
                        </span>
                      ) : (
                        formatTokenQty(estimatedTokens) + ' ' + symbol
                      )}
                    </span>
                  </div>
                  {quote && quote.priceImpactBps > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Price Impact</span>
                      <span className="font-mono text-[var(--accent-premium)]">
                        {formatPct(quote.priceImpactBps / 100)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Balance</span>
                    <span className="font-mono">
                      {formatNativeAmount(user?.balance || 0, activeChain, 4)} {nativeSymbol}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] text-right">
                    {quoteError ? "Estimate unavailable — using cached price" : quote ? "Live server quote" : "Final amount determined at execution"}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={tradeMutation.isPending || nativeAmount <= 0}
                >
                  {tradeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Buy {symbol}
                </Button>

                {/* RISK_SCORE_CARD_SLOT — future educational feature */}
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 text-center">
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Risk analysis coming soon
                  </p>
                </div>
              </form>
            </Form>
          ) : (
            <Form {...sellForm}>
              <form onSubmit={onSellSubmit} className="space-y-4">
                <FormField
                  control={sellForm.control}
                  name="percentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sell Percentage</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          max="100"
                          placeholder="100"
                          className="font-mono"
                          disabled={tradeMutation.isPending}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 100)}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <Button
                      key={pct}
                      type="button"
                      variant={percentage === pct ? "default" : "secondary"}
                      size="sm"
                      className="flex-1"
                      onClick={() => sellForm.setValue("percentage", pct)}
                      disabled={tradeMutation.isPending}
                    >
                      {pct}%
                    </Button>
                  ))}
                </div>

                {position && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Position</span>
                      <span className="font-mono">
                        {formatTokenAmount(position.amount, positionDecimals, 2)} {symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Selling</span>
                      <span className="font-mono font-medium">
                        {formatTokenAmount(sellAmountBigInt, positionDecimals, 2)} {symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Est. Value</span>
                      <span className="font-mono font-medium">
                        {isQuoting && percentage > 0 ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                            Quoting...
                          </span>
                        ) : (
                          `${formatNativeAmount(sellValueBigInt, activeChain, 4)} ${nativeSymbol}`
                        )}
                      </span>
                    </div>
                    {quote && quote.priceImpactBps > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Price Impact</span>
                        <span className="font-mono text-[var(--accent-premium)]">
                          {formatPct(quote.priceImpactBps / 100)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-2 border-t border-[var(--border-subtle)]">
                      <span className="text-[var(--text-secondary)]">Est. P&L</span>
                      <span
                        className={cn(
                          "font-mono font-medium",
                          profitLossBigInt >= 0n
                            ? "text-[var(--accent-gain)]"
                            : "text-[var(--accent-loss)]"
                        )}
                      >
                        {profitLossBigInt >= 0n ? "+" : ""}
                        {`${formatNativeAmount(profitLossBigInt, activeChain, 4)} ${nativeSymbol}`}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] text-right">
                      {quoteError ? "Estimate unavailable — using cached price" : quote ? "Live server quote" : "Final amount determined at execution"}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="danger"
                  className="w-full"
                  size="lg"
                  disabled={tradeMutation.isPending || percentage <= 0}
                >
                  {tradeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Sell {percentage}%
                </Button>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
