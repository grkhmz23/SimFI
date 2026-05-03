// server/services/prediction/polymarketWs.ts
// Polymarket WebSocket market channel client

import WebSocket from "ws";

const WS_URL = process.env.POLYMARKET_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

interface Tick {
  tokenId: string;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  receivedAt: number;
}

interface BookLevel {
  price: number;
  size: number;
}

interface BookMirror {
  bids: Map<number, number>;
  asks: Map<number, number>;
}

type TickListener = (tick: Tick) => void;

class PolymarketWsClient {
  private ws: WebSocket | null = null;
  private subscribedTokenIds = new Set<string>();
  private bookMirrors = new Map<string, BookMirror>();
  private listeners = new Set<TickListener>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;
  private readonly pingInterval = 30_000;
  private readonly watchdogTimeout = 60_000;
  private isShuttingDown = false;

  start(): void {
    if (this.ws || this.isShuttingDown) return;
    this.connect();
  }

  stop(): void {
    this.isShuttingDown = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client shutdown');
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  subscribe(tokenIds: string[]): void {
    for (const id of tokenIds) {
      this.subscribedTokenIds.add(id);
    }
    this.resubscribe();
  }

  unsubscribe(tokenIds: string[]): void {
    for (const id of tokenIds) {
      this.subscribedTokenIds.delete(id);
      this.bookMirrors.delete(id);
    }
    // Best-effort: full reconnect required to truly unsubscribe from Polymarket protocol
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.resubscribe();
    }
  }

  onTick(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLatest(tokenId: string): Tick | null {
    const mirror = this.bookMirrors.get(tokenId);
    if (!mirror) return null;

    const bestBid = this.getBestBid(mirror);
    const bestAsk = this.getBestAsk(mirror);
    return {
      tokenId,
      bestBid,
      bestAsk,
      midpoint: bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : (bestBid ?? bestAsk),
      receivedAt: Date.now(),
    };
  }

  private connect(): void {
    if (this.isShuttingDown) return;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        console.log('[polymarket-ws] connected');
        this.reconnectDelay = 1000;
        this.lastMessageAt = Date.now();
        this.startPing();
        this.startWatchdog();
        this.resubscribe();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        this.lastMessageAt = Date.now();
        this.handleMessage(data.toString());
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`[polymarket-ws] closed: ${code} ${reason.toString()}`);
        this.ws = null;
        this.clearTimers();
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err: Error) => {
        console.error('[polymarket-ws] error:', err.message);
      });
    } catch (err: any) {
      console.error('[polymarket-ws] failed to create socket:', err.message);
      this.scheduleReconnect();
    }
  }

  private resubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.subscribedTokenIds.size === 0) return;

    const ids = Array.from(this.subscribedTokenIds);
    // Polymarket allows up to 500 per connection; we stay conservative at 200
    const payload = {
      assets_ids: ids.slice(0, 200),
      type: 'market',
    };
    this.ws.send(JSON.stringify(payload));
    console.log(`[polymarket-ws] subscribed to ${Math.min(ids.length, 200)} assets`);
  }

  private handleMessage(raw: string): void {
    if (raw === '"PONG"' || raw === 'PONG') return;

    try {
      const events = JSON.parse(raw);
      const array = Array.isArray(events) ? events : [events];

      for (const event of array) {
        if (!event || typeof event !== 'object') continue;

        switch (event.event_type) {
          case 'book':
            this.handleBookEvent(event);
            break;
          case 'price_change':
            this.handlePriceChangeEvent(event);
            break;
          case 'tick_size_change':
            console.log('[polymarket-ws] tick_size_change ignored');
            break;
          case 'last_trade_price':
            // optional; could surface in UI if needed
            break;
          default:
            // ignore unknown
        }
      }
    } catch (err) {
      // ignore parse errors
    }
  }

  private handleBookEvent(event: any): void {
    const tokenId = event.asset_id;
    if (!tokenId) return;

    const bids = new Map<number, number>();
    const asks = new Map<number, number>();

    for (const level of event.bids || []) {
      const price = Number(level.price);
      const size = Number(level.size);
      if (isFinite(price) && isFinite(size)) bids.set(price, size);
    }
    for (const level of event.asks || []) {
      const price = Number(level.price);
      const size = Number(level.size);
      if (isFinite(price) && isFinite(size)) asks.set(price, size);
    }

    this.bookMirrors.set(tokenId, { bids, asks });
    this.emitTick(tokenId);
  }

  private handlePriceChangeEvent(event: any): void {
    const tokenId = event.asset_id;
    if (!tokenId) return;

    let mirror = this.bookMirrors.get(tokenId);
    if (!mirror) {
      mirror = { bids: new Map(), asks: new Map() };
      this.bookMirrors.set(tokenId, mirror);
    }

    for (const change of event.changes || []) {
      const price = Number(change.price);
      const size = Number(change.size);
      const side = change.side;

      if (!isFinite(price)) continue;

      const map = side === 'SELL' ? mirror.asks : mirror.bids;
      if (size === 0) {
        map.delete(price);
      } else if (isFinite(size)) {
        map.set(price, size);
      }
    }

    this.emitTick(tokenId);
  }

  private emitTick(tokenId: string): void {
    const tick = this.getLatest(tokenId);
    if (!tick) return;
    for (const listener of this.listeners) {
      try {
        listener(tick);
      } catch (err) {
        // ignore listener errors
      }
    }
  }

  private getBestBid(mirror: BookMirror): number | null {
    let best: number | null = null;
    for (const [price] of mirror.bids) {
      if (best === null || price > best) best = price;
    }
    return best;
  }

  private getBestAsk(mirror: BookMirror): number | null {
    let best: number | null = null;
    for (const [price] of mirror.asks) {
      if (best === null || price < best) best = price;
    }
    return best;
  }

  private startPing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('"PING"');
      }
    }, this.pingInterval);
  }

  private startWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt > this.watchdogTimeout) {
        console.warn('[polymarket-ws] watchdog triggered, forcing reconnect');
        this.ws?.terminate();
      }
    }, this.watchdogTimeout);
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  private clearTimers(): void {
    this.clearPing();
    this.clearWatchdog();
    this.clearReconnect();
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const polymarketWs = new PolymarketWsClient();
