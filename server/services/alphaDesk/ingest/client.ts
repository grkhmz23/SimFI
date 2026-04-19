// server/services/alphaDesk/ingest/client.ts
// Shared fetch wrapper with circuit breaker, rate-limit backoff, and timeout.

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  successCount: number;
}

const circuits = new Map<string, CircuitState>();

const CIRCUIT_CONFIG = {
  failureThreshold: 5,
  resetTimeMs: 60_000,
  successThreshold: 2,
};

function getCircuit(apiName: string): CircuitState {
  let s = circuits.get(apiName);
  if (!s) {
    s = { failures: 0, lastFailure: 0, isOpen: false, successCount: 0 };
    circuits.set(apiName, s);
  }
  return s;
}

function recordSuccess(apiName: string): void {
  const s = getCircuit(apiName);
  s.successCount++;
  if (s.isOpen && s.successCount >= CIRCUIT_CONFIG.successThreshold) {
    console.log(`[AlphaDesk] Circuit CLOSED for ${apiName}`);
    s.isOpen = false;
    s.failures = 0;
    s.successCount = 0;
  }
}

function recordFailure(apiName: string): void {
  const s = getCircuit(apiName);
  s.failures++;
  s.lastFailure = Date.now();
  s.successCount = 0;
  if (s.failures >= CIRCUIT_CONFIG.failureThreshold && !s.isOpen) {
    s.isOpen = true;
    console.warn(`[AlphaDesk] Circuit OPEN for ${apiName} after ${s.failures} failures`);
  }
}

function isCircuitOpen(apiName: string): boolean {
  const s = getCircuit(apiName);
  if (!s.isOpen) return false;
  if (Date.now() - s.lastFailure > CIRCUIT_CONFIG.resetTimeMs) {
    console.log(`[AlphaDesk] Circuit HALF-OPEN for ${apiName}`);
    return false;
  }
  return true;
}

function classifyStatus(status: number): "retryable" | "fatal" | "ok" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429 || status === 408 || status >= 500) return "retryable";
  return "fatal";
}

export interface IngestFetchOptions {
  apiName: string;
  url: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  retries?: number;
  retryDelayMs?: number;
}

export async function ingestFetch(options: IngestFetchOptions): Promise<Response | null> {
  const { apiName, url, timeoutMs = 15_000, headers = {}, retries = 2, retryDelayMs = 1_000 } = options;

  if (isCircuitOpen(apiName)) {
    console.log(`[AlphaDesk] ${apiName} circuit OPEN — skipping request`);
    return null;
  }

  let lastErr: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "SimFi-AlphaDesk/1.0",
          Accept: "application/json",
          ...headers,
        },
      });
      clearTimeout(t);

      const statusClass = classifyStatus(res.status);

      if (statusClass === "ok") {
        recordSuccess(apiName);
        return res;
      }

      if (statusClass === "fatal") {
        console.warn(`[AlphaDesk] ${apiName} fatal error ${res.status}`);
        recordFailure(apiName);
        return null;
      }

      // retryable
      const text = await res.text().catch(() => "");
      console.warn(`[AlphaDesk] ${apiName} attempt ${attempt + 1}/${retries + 1} error ${res.status}: ${text.slice(0, 200)}`);
      recordFailure(apiName);

      if (attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err: any) {
      clearTimeout(t);
      lastErr = err;
      const isTimeout = err.name === "AbortError" || /timeout|abort/i.test(err.message);
      console.warn(`[AlphaDesk] ${apiName} attempt ${attempt + 1}/${retries + 1} ${isTimeout ? "timeout" : "error"}: ${err.message}`);
      recordFailure(apiName);

      if (attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error(`[AlphaDesk] ${apiName} failed after ${retries + 1} attempts: ${lastErr?.message}`);
  return null;
}

export async function ingestFetchBatch<T>(
  items: T[],
  fetcher: (item: T) => Promise<Response | null>,
  options: { delayMs?: number; apiName: string }
): Promise<Response[]> {
  const results: Response[] = [];
  for (const item of items) {
    const res = await fetcher(item);
    if (res) results.push(res);
    if (options.delayMs) {
      await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }
  return results;
}
