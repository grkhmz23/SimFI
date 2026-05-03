// server/services/prediction/polymarketGamma.ts
// Polymarket Gamma API integration (market discovery, metadata)

const GAMMA_API_BASE = process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export interface GammaMarket {
  conditionId: string;
  slug: string;
  question: string;
  description: string;
  endDate: string | null;
  closed: boolean;
  active: boolean;
  archived: boolean;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  yesTokenId: string;
  noTokenId: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
}

interface ListMarketsParams {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  order?: string;
  ascending?: boolean;
  slug?: string;
  condition_ids?: string;
  tag_id?: string;
}

class PolymarketGammaService {
  private circuits: Map<string, CircuitState> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();
  private requestLog: number[] = []; // timestamps for token bucket

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
      console.warn(`[polymarket-gamma] Circuit OPEN for ${apiName}`);
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
          console.warn(`[polymarket-gamma] 429 on attempt ${attempt + 1}, backing off ${delay}ms`);
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

  private normalizeMarket(raw: any): GammaMarket | null {
    try {
      const clobTokenIds = typeof raw.clobTokenIds === 'string'
        ? JSON.parse(raw.clobTokenIds)
        : raw.clobTokenIds;

      if (!Array.isArray(clobTokenIds) || clobTokenIds.length !== 2) {
        return null; // v1: binary markets only
      }

      const outcomePrices = typeof raw.outcomePrices === 'string'
        ? JSON.parse(raw.outcomePrices).map(Number)
        : Array.isArray(raw.outcomePrices)
          ? raw.outcomePrices.map(Number)
          : [];

      const outcomes = typeof raw.outcomes === 'string'
        ? JSON.parse(raw.outcomes)
        : Array.isArray(raw.outcomes)
          ? raw.outcomes
          : [];

      return {
        conditionId: raw.conditionId || raw.condition_id || '',
        slug: raw.slug || '',
        question: raw.question || '',
        description: raw.description || '',
        endDate: raw.endDate || raw.end_date || null,
        closed: !!raw.closed,
        active: raw.active !== false,
        archived: !!raw.archived,
        outcomes,
        outcomePrices,
        clobTokenIds,
        yesTokenId: clobTokenIds[0] || '',
        noTokenId: clobTokenIds[1] || '',
        volume: Number(raw.volume) || 0,
        volume24hr: Number(raw.volume24hr || raw.volume24h) || 0,
        liquidity: Number(raw.liquidity) || 0,
      };
    } catch (e) {
      return null;
    }
  }

  async listMarkets(params: ListMarketsParams = {}): Promise<GammaMarket[]> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.active !== undefined) query.set('active', String(params.active));
    if (params.closed !== undefined) query.set('closed', String(params.closed));
    if (params.archived !== undefined) query.set('archived', String(params.archived));
    if (params.order) query.set('order', params.order);
    if (params.ascending !== undefined) query.set('ascending', String(params.ascending));
    if (params.slug) query.set('slug', params.slug);
    if (params.condition_ids) query.set('condition_ids', params.condition_ids);
    if (params.tag_id) query.set('tag_id', params.tag_id);

    const cacheKey = `markets:${query.toString()}`;
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    const url = `${GAMMA_API_BASE}/markets?${query.toString()}`;
    const promise = (async () => {
      try {
        const data = await this.fetchWithRetry(url, 'gamma-markets');
        const markets = Array.isArray(data) ? data : (data.markets || []);
        return markets.map(this.normalizeMarket).filter((m: GammaMarket | null): m is GammaMarket => m !== null);
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  async getMarketBySlug(slug: string): Promise<GammaMarket | null> {
    const markets = await this.listMarkets({ slug, limit: 1 });
    return markets[0] || null;
  }

  async getMarketByConditionId(conditionId: string): Promise<GammaMarket | null> {
    const markets = await this.listMarkets({ condition_ids: conditionId, limit: 1 });
    return markets[0] || null;
  }
}

export const polymarketGamma = new PolymarketGammaService();
