// server/services/alphaDesk/llm/client.ts
// Multi-provider LLM client with failover, cooldowns, and JSON repair.
// Primary: Moonshot. Fallback 1: OpenAI. Fallback 2: OpenRouter.

import { z } from "zod";

// ============================================================================
// Config
// ============================================================================

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1_500;
const RETRY_MAX_DELAY_MS = 15_000;

interface LlmProvider {
  id: string;
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
}

interface ProviderFailureState {
  errorCount: number;
  cooldownUntil: number;
  disabledUntil: number;
  lastFailureAt: number;
}

// ============================================================================
// Provider resolution
// ============================================================================

function resolveProviders(): LlmProvider[] {
  const providers: LlmProvider[] = [
    {
      id: "moonshot",
      apiKey: process.env.MOONSHOT_API_KEY,
      baseUrl: process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1/chat/completions",
      model: process.env.MOONSHOT_MODEL || "kimi-k2-thinking-turbo",
    },
    {
      id: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
    {
      id: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    },
  ];

  // Filter to providers with keys
  const ordered = (process.env.LLM_PROVIDER_ORDER || "moonshot,openai,openrouter")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const result: LlmProvider[] = [];
  for (const id of ordered) {
    const p = providers.find((pr) => pr.id === id);
    if (p && p.apiKey) result.push(p);
  }
  // Append any configured providers not in custom order
  for (const p of providers) {
    if (p.apiKey && !result.find((r) => r.id === p.id)) result.push(p);
  }
  return result;
}

// ============================================================================
// In-memory failure state
// ============================================================================

const providerFailures = new Map<string, ProviderFailureState>();

function getFailureState(providerId: string): ProviderFailureState {
  const now = Date.now();
  const existing = providerFailures.get(providerId);
  if (!existing) {
    return { errorCount: 0, cooldownUntil: 0, disabledUntil: 0, lastFailureAt: 0 };
  }
  // Reset if last failure older than 24h
  if (now - existing.lastFailureAt > 24 * 60 * 60 * 1000) {
    const fresh = { errorCount: 0, cooldownUntil: 0, disabledUntil: 0, lastFailureAt: 0 };
    providerFailures.set(providerId, fresh);
    return fresh;
  }
  return existing;
}

function markProviderSuccess(providerId: string): void {
  providerFailures.set(providerId, {
    errorCount: 0,
    cooldownUntil: 0,
    disabledUntil: 0,
    lastFailureAt: 0,
  });
}

function markProviderFailure(providerId: string, reason: string): void {
  const now = Date.now();
  const state = getFailureState(providerId);
  state.errorCount++;
  state.lastFailureAt = now;

  const isBilling = /billing|credit|quota|payment|402|insufficient/i.test(reason);
  if (isBilling) {
    const steps = [5, 10, 20, 24]; // hours
    const idx = Math.min(state.errorCount - 1, steps.length - 1);
    state.disabledUntil = now + steps[idx] * 60 * 60 * 1000;
  } else {
    const steps = [15_000, 60_000, 3 * 60_000, 10 * 60_000]; // ms
    const idx = Math.min(state.errorCount - 1, steps.length - 1);
    state.cooldownUntil = now + steps[idx];
  }
  providerFailures.set(providerId, state);
}

function isProviderUsable(providerId: string): boolean {
  const now = Date.now();
  const state = getFailureState(providerId);
  if (now < state.disabledUntil) return false;
  if (now < state.cooldownUntil) return false;
  return true;
}

// ============================================================================
// Error classification
// ============================================================================

function classifyError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (/401|403/.test(msg)) return "auth";
    if (/402/.test(msg)) return "billing";
    if (/429/.test(msg)) return "rate_limit";
    if (/408/.test(msg) || /timeout|abort/i.test(msg)) return "timeout";
    if (/500|502|503|504|overloaded/i.test(msg)) return "server";
    if (/404|400|model not found/i.test(msg)) return "format";
    if (/billing|credit|quota|payment|insufficient/i.test(msg)) return "billing";
  }
  return "unknown";
}

// ============================================================================
// Fetch with timeout and retry
// ============================================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function callProviderWithRetry(
  provider: LlmProvider,
  body: unknown
): Promise<unknown> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        provider.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const json = await res.json();
      return json;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const reason = classifyError(lastError);
      const isRetryable = /timeout|rate_limit|server|unknown/.test(reason);
      if (!isRetryable || attempt === MAX_RETRIES) break;

      const delay = Math.min(
        RETRY_DELAY_MS * Math.pow(2, attempt - 1),
        RETRY_MAX_DELAY_MS
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError ?? new Error(`Provider ${provider.id} failed`);
}

// ============================================================================
// JSON parsing & repair
// ============================================================================

export function parseJsonFromLlm(raw: string, schema: z.ZodTypeAny): unknown {
  // Strip markdown fences
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/gm, "").trim();
  // Find first { or [
  const firstBrace = cleaned.search(/[{[]/);
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.search(/}[\s\n]*$/);
  const lastBracket = cleaned.search(/][\s\n]*$/);
  const lastIdx = Math.max(lastBrace, lastBracket);
  if (lastIdx > 0) cleaned = cleaned.slice(0, lastIdx + 1);

  const parsed = JSON.parse(cleaned);
  return schema.parse(parsed);
}

async function repairJsonWithLlm(
  brokenJson: string,
  contextLabel: string
): Promise<string> {
  const systemPrompt = `You are a JSON repair tool. Only output valid JSON and nothing else.`;
  const userPrompt = `Context: ${contextLabel}\n\nThe following JSON is broken. Fix it and output ONLY the corrected JSON object.\n\nBroken JSON:\n${brokenJson}`;

  const providers = resolveProviders().filter((p) => isProviderUsable(p.id));
  for (const provider of providers) {
    try {
      const json = await callProviderWithRetry(provider, {
        model: provider.model,
        max_tokens: 4096,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const content = (json as any)?.choices?.[0]?.message?.content;
      if (typeof content === "string") return content;
    } catch {
      // try next provider
    }
  }
  throw new Error("All providers failed during JSON repair");
}

export async function parseJsonFromLlmWithRepair(
  raw: string,
  schema: z.ZodTypeAny,
  contextLabel: string
): Promise<unknown> {
  try {
    return parseJsonFromLlm(raw, schema);
  } catch (firstErr) {
    console.warn(`[LLM] JSON parse failed, attempting repair: ${contextLabel}`);
    try {
      const repaired = await repairJsonWithLlm(raw, contextLabel);
      return parseJsonFromLlm(repaired, schema);
    } catch (repairErr) {
      throw new Error(
        `JSON repair failed for ${contextLabel}: ${(repairErr as Error).message}`
      );
    }
  }
}

// ============================================================================
// Public API: callLLM
// ============================================================================

export interface LlmCallOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callLLM(options: LlmCallOptions): Promise<string> {
  const providers = resolveProviders();
  if (providers.length === 0) {
    throw new Error("No LLM providers configured. Set MOONSHOT_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.");
  }

  const body = {
    model: "",
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.4,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
  };

  for (const provider of providers) {
    if (!isProviderUsable(provider.id)) {
      console.log(`[LLM] ${provider.id} on cooldown/disabled, skipping`);
      continue;
    }

    try {
      const json = await callProviderWithRetry(provider, { ...body, model: provider.model });
      const content = (json as any)?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error(`Empty response from ${provider.id}`);
      }
      markProviderSuccess(provider.id);
      console.log(`[LLM] Success via ${provider.id} (${provider.model})`);
      return content;
    } catch (err) {
      const reason = classifyError(err);
      markProviderFailure(provider.id, reason);
      console.warn(`[LLM] ${provider.id} failed (${reason}): ${(err as Error).message}`);
    }
  }

  throw new Error("All LLM providers failed");
}

export function getLlmProviderInfo(): { id: string; model: string } | null {
  const providers = resolveProviders().filter((p) => isProviderUsable(p.id));
  const p = providers[0];
  return p ? { id: p.id, model: p.model } : null;
}
