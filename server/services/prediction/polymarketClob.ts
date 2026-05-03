// server/services/prediction/polymarketClob.ts
// Polymarket CLOB API integration (order book, midpoint, price history)

const CLOB_API_BASE = process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com';

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  market: string;
  asset_id: string;
  bids: BookLevel[];
  asks: BookLevel[];
  timestamp: string;
  hash: string;
}

export interface PriceHistoryPoint {
  time: string;
  price: number;
}

class PolymarketClobService {
  private circuits: Map<string, CircuitState> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();
  private requestLog: number[] = [];

  private readonly CIRCUIT_THRESHOLD = 5;
  private readonly CIRCUIT_RESET_MS = 30_000;
  private readonly REQUEST_TIMEOUT = 8_000;
  private readonly RATE_LIMIT_RPM = 50;
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;

  private isCircuitOpen(apiName: string): boolean {
    const circuit = this.circuits.get(apiName);
    if (!circuit || !circuit.isOpen) return false;
    if (Date.now() - circuit.lastFailure > this.CIRCUIT_RESET_MS) {
      circuit.isOpen = false;
      circuit.failures = 0;
      return false;
    }
    return true;
  }

  private recordSuccess(apiName: string): void {
    const circuit = this.circuits.get(apiName);
    if (circuit) {
      circuit.failures = 0;
      circuit.isOpen = false;
    }
  }

  private recordFailure(apiName: string): void {
    let circuit = this.circuits.get(apiName);
    if (!circuit) {
      circuit = { failures: 0, lastFailure: 0, isOpen: false };
      this.circuits.set(apiName, circuit);
    }
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= this.CIRCUIT_THRESHOLD) {
      circuit.isOpen = true;
      console.warn(`[polymarket-clob] Circuit OPEN for ${apiName}`);
    }
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW_MS;
    this.requestLog = this.requestLog.filter(t => t > windowStart);
    if (this.requestLog.length >= this.RATE_LIMIT_RPM) {
      return false;
    }
    this.requestLog.push(now);
    return true;
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  private async fetchWithRetry(url: string, apiName: string): Promise<any> {
    if (this.isCircuitOpen(apiName)) {
      throw new Error(`Circuit open for ${apiName}`);
    }

    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded (50 req/min)');
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, this.REQUEST_TIMEOUT);
        if (response.status === 429) {
          const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 5000);
          console.warn(`[polymarket-clob] 429 on attempt ${attempt + 1}, backing off ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        this.recordSuccess(apiName);
        return data;
      } catch (err: any) {
        lastError = err;
        if (attempt < 2) {
          const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 5000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    this.recordFailure(apiName);
    throw lastError || new Error(`Failed after 3 attempts: ${apiName}`);
  }

  async getMidpoint(tokenId: string): Promise<number | null> {
    const url = `${CLOB_API_BASE}/midpoint?token_id=${encodeURIComponent(tokenId)}`;
    const data = await this.fetchWithRetry(url, 'clob-midpoint');
    const mid = data?.mid != null ? Number(data.mid) : null;
    return mid != null && isFinite(mid) ? mid : null;
  }

  async getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<number | null> {
    const url = `${CLOB_API_BASE}/price?token_id=${encodeURIComponent(tokenId)}&side=${side}`;
    const data = await this.fetchWithRetry(url, 'clob-price');
    const price = data?.price != null ? Number(data.price) : null;
    return price != null && isFinite(price) ? price : null;
  }

  async getOrderBook(tokenId: string): Promise<OrderBook | null> {
    const cacheKey = `book:${tokenId}`;
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    const url = `${CLOB_API_BASE}/book?token_id=${encodeURIComponent(tokenId)}`;
    const promise = (async () => {
      try {
        const data = await this.fetchWithRetry(url, 'clob-book');
        if (!data) return null;

        const bids: BookLevel[] = (data.bids || [])
          .map((l: any) => ({ price: Number(l.price), size: Number(l.size) }))
          .filter((l: BookLevel) => isFinite(l.price) && isFinite(l.size))
          .sort((a: BookLevel, b: BookLevel) => b.price - a.price); // descending

        const asks: BookLevel[] = (data.asks || [])
          .map((l: any) => ({ price: Number(l.price), size: Number(l.size) }))
          .filter((l: BookLevel) => isFinite(l.price) && isFinite(l.size))
          .sort((a: BookLevel, b: BookLevel) => a.price - b.price); // ascending

        return {
          market: data.market || '',
          asset_id: data.asset_id || tokenId,
          bids,
          asks,
          timestamp: data.timestamp || String(Date.now()),
          hash: data.hash || '',
        } as OrderBook;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  async getPriceHistory(
    tokenId: string,
    opts: { interval?: '1h' | '6h' | '1d' | '1w' | '1m' | 'max' } = {}
  ): Promise<PriceHistoryPoint[]> {
    const interval = opts.interval || '1d';
    const url = `${CLOB_API_BASE}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}`;
    const data = await this.fetchWithRetry(url, 'clob-history');
    const history = Array.isArray(data) ? data : (data.history || []);
    return history
      .map((p: any) => ({
        time: p.time || p.t || '',
        price: Number(p.price || p.p) || 0,
      }))
      .filter((p: PriceHistoryPoint) => p.time && isFinite(p.price));
  }
}

export const polymarketClob = new PolymarketClobService();
