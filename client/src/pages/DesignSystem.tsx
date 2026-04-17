import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DataCell } from "@/components/ui/data-cell"
import { AddressPill } from "@/components/ui/address-pill"
import { ChainChip } from "@/components/ui/chain-chip"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/hooks/use-toast"
import { ArrowRight, ChevronDown, Info } from "lucide-react"

export default function DesignSystem() {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-content px-6 py-16">
        <h1 className="text-display mb-4">Design System</h1>
        <p className="text-body text-[var(--text-secondary)] mb-16 max-w-2xl">
          SimFi editorial-luxury interface components. Every primitive shown with its variants.
        </p>

        {/* Typography */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Typography</h2>
          <div className="space-y-6">
            <div>
              <span className="text-small text-[var(--text-tertiary)] block mb-1">Display — Instrument Serif</span>
              <p className="text-display">Trade without risk</p>
            </div>
            <div>
              <span className="text-small text-[var(--text-tertiary)] block mb-1">H1 — Inter SemiBold</span>
              <p className="text-h1">Page Title</p>
            </div>
            <div>
              <span className="text-small text-[var(--text-tertiary)] block mb-1">H2 — Inter SemiBold</span>
              <p className="text-h2">Section Header</p>
            </div>
            <div>
              <span className="text-small text-[var(--text-tertiary)] block mb-1">Body — Inter Regular</span>
              <p className="text-body">Practice trading Solana and Base memecoins with virtual capital. Real market data, zero risk.</p>
            </div>
            <div>
              <span className="text-small text-[var(--text-tertiary)] block mb-1">Mono — JetBrains Mono</span>
              <p className="text-mono-lg">$12,847.63</p>
              <p className="text-mono text-[var(--text-secondary)]">0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb</p>
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Buttons</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="premium">Premium</Button>
          </div>
          <div className="flex flex-wrap gap-4 items-center mt-6">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Inputs */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Inputs</h2>
          <div className="grid gap-4 max-w-md">
            <Input placeholder="Placeholder text" />
            <Input value="Filled value" readOnly />
            <Textarea placeholder="Textarea placeholder" />
          </div>
        </section>

        {/* Cards */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Cards</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="card-flat p-5">
              <p className="text-small text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Flat</p>
              <p className="text-body text-[var(--text-secondary)]">Embedded list or nested panel surface.</p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Raised</CardTitle>
                <CardDescription>Primary card container with subtle border.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)]">Default card for main content.</p>
              </CardContent>
            </Card>
            <div className="card-glass p-5">
              <p className="text-small text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Glass</p>
              <p className="text-body text-[var(--text-secondary)]">Floating overlay with backdrop blur.</p>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Badges</h2>
          <div className="flex flex-wrap gap-3">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="gain">+12.4%</Badge>
            <Badge variant="loss">-3.2%</Badge>
            <Badge variant="premium">Premium</Badge>
          </div>
        </section>

        {/* DataCell */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">DataCell</h2>
          <div className="space-y-3">
            <div className="flex gap-8">
              <DataCell value="$12,847.63" />
              <DataCell value="$12,847.63" variant="gain" diff={4.32} />
              <DataCell value="$12,847.63" variant="loss" diff={-2.15} />
              <DataCell value="$12,847.63" variant="premium" />
            </div>
            <div className="flex gap-8">
              <DataCell value="0.004521" variant="secondary" />
              <DataCell value="0.004521" variant="tertiary" />
            </div>
          </div>
        </section>

        {/* AddressPill */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">AddressPill</h2>
          <div className="flex flex-wrap gap-4">
            <AddressPill address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" />
            <AddressPill address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" truncate="start" />
            <AddressPill address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" truncate="end" />
          </div>
        </section>

        {/* ChainChip */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">ChainChip</h2>
          <div className="flex gap-4">
            <ChainChip chain="base" />
            <ChainChip chain="solana" />
          </div>
        </section>

        {/* Skeleton */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Skeleton</h2>
          <div className="space-y-3 max-w-sm">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </section>

        {/* Dialog */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Dialog</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Action</DialogTitle>
                <DialogDescription>
                  This is a dialog description. It explains what will happen next.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Dialog content goes here. Cards, forms, or any other content.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>

        {/* DropdownMenu */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Dropdown Menu</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Options <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem>Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </section>

        {/* Tabs */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Tabs</h2>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="holders">Holders</TabsTrigger>
              <TabsTrigger value="trades">Trades</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="text-sm text-[var(--text-secondary)]">Overview content panel.</p>
            </TabsContent>
            <TabsContent value="holders">
              <p className="text-sm text-[var(--text-secondary)]">Holders content panel.</p>
            </TabsContent>
            <TabsContent value="trades">
              <p className="text-sm text-[var(--text-secondary)]">Trades content panel.</p>
            </TabsContent>
          </Tabs>
        </section>

        {/* Tooltip */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Tooltip</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm">Additional context appears here.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </section>

        {/* Toast */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Toast</h2>
          <div className="flex flex-wrap gap-4">
            <Button
              variant="secondary"
              onClick={() =>
                toast({ title: "Default toast", description: "Something happened." })
              }
            >
              Default Toast
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                toast({
                  variant: "destructive",
                  title: "Error",
                  description: "Something went wrong.",
                })
              }
            >
              Error Toast
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast({
                  variant: "success",
                  title: "Success",
                  description: "Trade executed successfully.",
                })
              }
            >
              Success Toast
            </Button>
          </div>
        </section>

        {/* Colors */}
        <section className="mb-20">
          <h2 className="text-h2 mb-8">Color Tokens</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="h-16 rounded-md bg-[var(--bg-base)] border border-[var(--border-subtle)]" />
              <p className="text-xs text-[var(--text-tertiary)]">bg-base</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-md bg-[var(--bg-raised)] border border-[var(--border-subtle)]" />
              <p className="text-xs text-[var(--text-tertiary)]">bg-raised</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-md bg-[var(--text-primary)]" />
              <p className="text-xs text-[var(--text-tertiary)]">text-primary</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-md bg-[var(--text-secondary)]" />
              <p className="text-xs text-[var(--text-tertiary)]">text-secondary</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-md bg-[var(--accent-gain)]" />
              <p className="text-xs text-[var(--text-tertiary)]">accent-gain</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-md bg-[var(--accent-loss)]" />
              <p className="text-xs text-[var(--text-tertiary)]">accent-loss</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-md bg-[var(--accent-premium)]" />
              <p className="text-xs text-[var(--text-tertiary)]">accent-premium</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 rounded-md border-2 border-[var(--border-subtle)] bg-[var(--bg-base)]" />
              <p className="text-xs text-[var(--text-tertiary)]">border-subtle</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
