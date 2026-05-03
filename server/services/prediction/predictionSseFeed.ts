// server/services/prediction/predictionSseFeed.ts
// Standalone SSE broadcaster for prediction-market prices

import type { Response } from "express";
import { polymarketWs } from './polymarketWs';

interface SseClient {
  id: string;
  res: Response;
  subscribedTokenIds: Set<string>;
  connectedAt: number;
}

class PredictionSseFeed {
  private clients = new Map<string, SseClient>();
  private clientCounter = 0;
  private readonly MAX_CLIENTS = 200;
  private readonly MAX_SUBS_PER_CLIENT = 50;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Wire into WS ticks once at module load
    polymarketWs.onTick((tick) => {
      this.broadcastTick(tick);
    });
  }

  /**
   * Add a new SSE client. Returns clientId or null if max reached.
   */
  addClient(res: Response, initialTokenIds: string[] = []): string | null {
    if (this.clients.size >= this.MAX_CLIENTS) {
      console.warn(`[prediction-sse] Max clients reached (${this.MAX_CLIENTS}), rejecting`);
      res.status(503).end();
      return null;
    }

    this.clientCounter++;
    const clientId = `pred-sse-${Date.now()}-${this.clientCounter}`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const subscribed = new Set<string>();
    for (const id of initialTokenIds.slice(0, this.MAX_SUBS_PER_CLIENT)) {
      subscribed.add(id);
    }

    const client: SseClient = {
      id: clientId,
      res,
      subscribedTokenIds: subscribed,
      connectedAt: Date.now(),
    };

    this.clients.set(clientId, client);
    this.startHeartbeat();

    // Send initial snapshot for subscribed tokens
    for (const tokenId of subscribed) {
      const tick = polymarketWs.getLatest(tokenId);
      if (tick) {
        this.sendToClient(clientId, "tick", tick);
      }
    }

    res.on("close", () => this.removeClient(clientId));
    res.on("error", () => this.removeClient(clientId));

    console.log(`[prediction-sse] Client connected: ${clientId} (total: ${this.clients.size})`);
    return clientId;
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.clients.delete(clientId);
    console.log(`[prediction-sse] Client disconnected: ${clientId} (total: ${this.clients.size})`);

    if (this.clients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  subscribe(clientId: string, tokenIds: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    for (const id of tokenIds) {
      if (client.subscribedTokenIds.size >= this.MAX_SUBS_PER_CLIENT) {
        console.warn(`[prediction-sse] Client ${clientId} hit max subscriptions`);
        break;
      }
      client.subscribedTokenIds.add(id);
      // Push initial snapshot
      const tick = polymarketWs.getLatest(id);
      if (tick) {
        this.sendToClient(clientId, "tick", tick);
      }
    }
  }

  unsubscribe(clientId: string, tokenIds: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    for (const id of tokenIds) {
      client.subscribedTokenIds.delete(id);
    }
  }

  private broadcastTick(tick: { tokenId: string; bestBid: number | null; bestAsk: number | null; midpoint: number | null; receivedAt: number }): void {
    for (const [clientId, client] of this.clients) {
      if (client.subscribedTokenIds.has(tick.tokenId)) {
        this.sendToClient(clientId, "tick", tick);
      }
    }
  }

  private sendToClient(clientId: string, event: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    try {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (err: any) {
      this.removeClient(clientId);
      return false;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        try {
          client.res.write(":ping\n\n");
        } catch {
          this.removeClient(clientId);
        }
      }
    }, 15_000);
  }

  getStats(): { clients: number; totalSubscriptions: number } {
    let totalSubs = 0;
    for (const client of this.clients.values()) {
      totalSubs += client.subscribedTokenIds.size;
    }
    return { clients: this.clients.size, totalSubscriptions: totalSubs };
  }
}

export const predictionSseFeed = new PredictionSseFeed();
console.log('[prediction-sse] mounted at /api/sse/prediction-prices');
