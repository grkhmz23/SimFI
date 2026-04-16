// server/services/jupiterService.ts
// Jupiter API integration for Solana (Swap V2, Price V2, Token API)

const JUPITER_API_BASE = 'https://api.jup.ag';
const API_KEY = process.env.JUPITER_API_KEY;

if (!API_KEY) {
  console.warn('⚠️  JUPITER_API_KEY not set. Jupiter API features will be disabled.');
}

// SOL mint address
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export interface JupiterToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  extensions?: {
    coingeckoId?: string;
    website?: string;
    twitter?: string;
    discord?: string;
    telegram?: string;
    description?: string;
  };
}

interface JupiterPriceResponse {
  data: Record<string, {
    id: string;
    type: string;
    price: string;
  }>;
}

export interface JupiterOrderResponse {
  mode: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  inUsdValue: number;
  outUsdValue: number;
  priceImpact: number;
  swapUsdValue: number;
  swapMode: string;
  slippageBps: number;
  router: string;
  feeBps: number;
  transaction?: string | null;
  lastValidBlockHeight?: string;
  gasless?: boolean;
  requestId?: string;
  quoteId?: string;
  error?: string;
  errorMessage?: string;
}

class JupiterService {
  private circuits: Map<string, CircuitState> = new Map();
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private quoteInFlight: Map<string, Promise<JupiterOrderResponse | null>> = new Map();

  private readonly CIRCUIT_THRESHOLD = 5;
  private readonly CIRCUIT_RESET_MS = 30_000;
  private readonly PRICE_CACHE_TTL = 5000; // 5s
  private readonly QUOTE_TIMEOUT = 8000;

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
      console.warn(`⚠️  Circuit OPEN for ${apiName}`);
    }
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: API_KEY ? { 'x-api-key': API_KEY } : {},
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Get Jupiter Swap V2 /order quote (no taker = quote only, no transaction)
   */
  async getOrderQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number = 50
  ): Promise<JupiterOrderResponse | null> {
    if (!API_KEY) return null;
    if (this.isCircuitOpen('jupiter-swap')) {
      console.log('⏸️  Jupiter swap circuit open, skipping');
      return null;
    }

    const cacheKey = `quote:${inputMint}:${outputMint}:${amount}:${slippageBps}`;
    const inFlight = this.quoteInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const url = `${JUPITER_API_BASE}/swap/v2/order?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(amount)}&slippageBps=${slippageBps}`;

    const promise = (async () => {
      try {
        const response = await this.fetchWithTimeout(url, this.QUOTE_TIMEOUT);
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          console.warn('⚠️  Jupiter quote error:', err.error || response.statusText);
          this.recordFailure('jupiter-swap');
          return null;
        }
        const data = (await response.json()) as JupiterOrderResponse;
        if (data.error || data.errorMessage) {
          console.warn('⚠️  Jupiter quote error:', data.errorMessage || data.error);
          this.recordFailure('jupiter-swap');
          return null;
        }
        this.recordSuccess('jupiter-swap');
        return data;
      } catch (error: any) {
        console.warn('⚠️  Jupiter quote fetch error:', error.message);
        this.recordFailure('jupiter-swap');
        return null;
      }
    })();

    this.quoteInFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.quoteInFlight.delete(cacheKey);
    }
  }

  /**
   * Get Jupiter Price V2 for a mint
   */
  async getPrice(mint: string): Promise<number | null> {
    if (!API_KEY) return null;

    const cached = this.priceCache.get(mint);
    if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
      return cached.price;
    }

    if (this.isCircuitOpen('jupiter-price')) {
      return cached?.price ?? null;
    }

    try {
      const response = await this.fetchWithTimeout(
        `${JUPITER_API_BASE}/price/v2?ids=${encodeURIComponent(mint)}`,
        5000
      );
      if (!response.ok) {
        this.recordFailure('jupiter-price');
        return cached?.price ?? null;
      }
      const data = (await response.json()) as JupiterPriceResponse;
      const priceStr = data.data?.[mint]?.price;
      if (!priceStr) {
        this.recordFailure('jupiter-price');
        return cached?.price ?? null;
      }
      const price = parseFloat(priceStr);
      if (!isFinite(price) || price <= 0) {
        return cached?.price ?? null;
      }
      this.priceCache.set(mint, { price, timestamp: Date.now() });
      this.recordSuccess('jupiter-price');
      return price;
    } catch (error: any) {
      this.recordFailure('jupiter-price');
      return cached?.price ?? null;
    }
  }

  /**
   * Search tokens via Jupiter Token API
   */
  async searchTokens(query: string): Promise<JupiterToken[]> {
    if (!API_KEY) return [];
    if (this.isCircuitOpen('jupiter-token')) return [];

    try {
      const response = await this.fetchWithTimeout(
        `${JUPITER_API_BASE}/tokens/v1/search?query=${encodeURIComponent(query)}`,
        5000
      );
      if (!response.ok) {
        this.recordFailure('jupiter-token');
        return [];
      }
      const data = (await response.json()) as JupiterToken[];
      this.recordSuccess('jupiter-token');
      return data || [];
    } catch (error: any) {
      this.recordFailure('jupiter-token');
      return [];
    }
  }

  /**
   * Get token metadata via Jupiter Token API
   */
  async getToken(mint: string): Promise<JupiterToken | null> {
    if (!API_KEY) return null;
    if (this.isCircuitOpen('jupiter-token')) return null;

    try {
      const response = await this.fetchWithTimeout(
        `${JUPITER_API_BASE}/tokens/v1/token/${encodeURIComponent(mint)}`,
        5000
      );
      if (!response.ok) {
        this.recordFailure('jupiter-token');
        return null;
      }
      const data = (await response.json()) as JupiterToken;
      this.recordSuccess('jupiter-token');
      return data;
    } catch (error: any) {
      this.recordFailure('jupiter-token');
      return null;
    }
  }

  isConfigured(): boolean {
    return !!API_KEY;
  }
}

export const jupiterService = new JupiterService();
