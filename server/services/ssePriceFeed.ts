import type { Response } from "express";
import { marketDataService } from "./marketData";
import { getAllNativePricesDetailed } from "../nativePrice";
import type { Chain } from "@shared/schema";

interface SseClient {
  id: string;
  res: Response;
  subscriptions: Set<string>; // "chain:address"
  connectedAt: number;
}

interface TokenSubscription {
  address: string;
  chain: Chain;
}

class SsePriceFeed {
  private clients = new Map<string, SseClient>();
  private broadcastInterval: NodeJS.Timeout | null = null;
  private clientCounter = 0;
  private readonly MAX_CLIENTS = 200;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Start the broadcast loop if not already running
   */
  start(): void {
    if (this.broadcastInterval) return;

    // Prime native price caches before first broadcast so clients don't get nulls
    import("../nativePrice")
      .then(({ getNativePrice }) =>
        Promise.all([getNativePrice("solana"), getNativePrice("base")])
      )
      .then(() => console.log("[SSE] Native price cache primed"))
      .catch((err: any) => console.warn("[SSE] Failed to prime native price cache:", err.message));

    this.broadcastInterval = setInterval(() => this.broadcast(), 3000);
    console.log("[SSE] Price feed broadcast loop started (3s interval)");
  }

  /**
   * Stop the broadcast loop
   */
  stop(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
      console.log("[SSE] Price feed broadcast loop stopped");
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log("[SSE] Heartbeat stopped");
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.purgeStaleClients();
    }, 30000); // Check every 30s
  }

  private purgeStaleClients(): void {
    const now = Date.now();
    const STALE_THRESHOLD_MS = 60000; // 60s without activity
    for (const [clientId, client] of this.clients) {
      if (now - client.connectedAt > STALE_THRESHOLD_MS) {
        // Try to send a ping; if it fails, remove the client
        try {
          client.res.write(":ping\n\n");
        } catch {
          this.removeClient(clientId);
        }
      }
    }
  }

  /**
   * Add a new SSE client
   */
  addClient(res: Response): string | null {
    // Enforce max client limit
    if (this.clients.size >= this.MAX_CLIENTS) {
      console.warn(`[SSE] Max clients reached (${this.MAX_CLIENTS}), rejecting new connection`);
      res.status(503).end();
      return null;
    }

    this.clientCounter++;
    const clientId = `sse-${Date.now()}-${this.clientCounter}`;

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders?.();

    const client: SseClient = {
      id: clientId,
      res,
      subscriptions: new Set(),
      connectedAt: Date.now(),
    };

    this.clients.set(clientId, client);
    this.start();
    this.startHeartbeat();

    // Send initial connection ack with current prices immediately
    try {
      const prices = getAllNativePricesDetailed();
      this.sendToClient(clientId, "connected", {
        clientId,
        message: "SSE connection established",
        prices: {
          sol: prices.sol.usd,
          eth: prices.eth.usd,
        },
      });
    } catch {
      this.sendToClient(clientId, "connected", { clientId, message: "SSE connection established" });
    }

    // Clean up on disconnect
    res.on("close", () => {
      this.removeClient(clientId);
    });

    res.on("error", (err: any) => {
      console.error(`[SSE] Client ${clientId} error:`, err.message);
      this.removeClient(clientId);
    });

    console.log(`[SSE] Client connected: ${clientId} (total: ${this.clients.size})`);
    return clientId;
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);
    console.log(`[SSE] Client disconnected: ${clientId} (total: ${this.clients.size})`);

    // Stop broadcast loop if no clients
    if (this.clients.size === 0) {
      this.stop();
    }
  }

  /**
   * Subscribe a client to token price updates
   */
  subscribe(clientId: string, tokens: TokenSubscription[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    for (const { address, chain } of tokens) {
      client.subscriptions.add(`${chain}:${address}`);
    }

    console.log(`[SSE] Client ${clientId} subscribed to ${tokens.length} tokens`);
  }

  /**
   * Unsubscribe a client from token price updates
   */
  unsubscribe(clientId: string, tokens: TokenSubscription[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    for (const { address, chain } of tokens) {
      client.subscriptions.delete(`${chain}:${address}`);
    }
  }

  /**
   * Send an event to a specific client
   */
  private sendToClient(clientId: string, event: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (err: any) {
      console.error(`[SSE] Failed to send to ${clientId}:`, err.message);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast price updates to all connected clients
   */
  private async broadcast(): Promise<void> {
    if (this.clients.size === 0) return;

    // 1. Broadcast native prices to ALL clients
    try {
      const nativePrices = getAllNativePricesDetailed();
      const payload = {
        sol: nativePrices.sol.usd,
        eth: nativePrices.eth.usd,
        timestamp: Date.now(),
      };

      for (const [clientId, client] of this.clients) {
        this.sendToClient(clientId, "nativePrices", payload);
      }
    } catch (err: any) {
      console.error("[SSE] Failed to broadcast native prices:", err.message);
    }

    // 2. Collect all unique token subscriptions across all clients
    const uniqueTokens = new Map<string, TokenSubscription>();
    for (const client of this.clients.values()) {
      for (const key of client.subscriptions) {
        const [chain, address] = key.split(":");
        if (chain && address) {
          uniqueTokens.set(key, { chain: chain as Chain, address });
        }
      }
    }

    if (uniqueTokens.size === 0) return;

    // 3. Fetch prices from cache (will hit cache, no upstream calls if cached)
    const tokenUpdates: Array<{
      address: string;
      chain: Chain;
      priceUsd: number;
      priceChange24h: number;
      priceNative: string;
    }> = [];

    await Promise.all(
      Array.from(uniqueTokens.values()).map(async ({ chain, address }) => {
        try {
          const data = await marketDataService.getToken(address, chain);
          if (data) {
            tokenUpdates.push({
              address,
              chain,
              priceUsd: data.priceUsd,
              priceChange24h: data.priceChange24h,
              priceNative: data.priceNative.toString(),
            });
          }
        } catch (err: any) {
          // Skip failed tokens silently
        }
      })
    );

    if (tokenUpdates.length === 0) return;

    // 4. Send relevant updates to each client
    for (const [clientId, client] of this.clients) {
      const relevant = tokenUpdates.filter((t) =>
        client.subscriptions.has(`${t.chain}:${t.address}`)
      );
      if (relevant.length > 0) {
        this.sendToClient(clientId, "tokenPrices", relevant);
      }
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats(): { clients: number; totalSubscriptions: number } {
    let totalSubs = 0;
    for (const client of this.clients.values()) {
      totalSubs += client.subscriptions.size;
    }
    return { clients: this.clients.size, totalSubscriptions: totalSubs };
  }
}

export const ssePriceFeed = new SsePriceFeed();
