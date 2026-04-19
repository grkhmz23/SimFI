/**
 * Single source of truth for all numeric formatting in the SimFi client.
 *
 * Rules:
 * - No component may format numbers inline.
 * - Every call to .toFixed(), .toLocaleString(), or manual string concatenation
 *   of numeric values in client/src/** that is not inside this file is a violation.
 */

import { createElement } from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInvalid(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

function stripTrailingZeros(s: string): string {
  return s.replace(/(\.[0-9]*?)0+$/, "$1").replace(/\.$/, "");
}

function fmtCompact(num: number, suffixes: [number, string][]): string {
  for (const [threshold, suffix] of suffixes) {
    if (num >= threshold) {
      const scaled = num / threshold;
      const decimals = scaled < 10 ? 2 : 1;
      return `${stripTrailingZeros(scaled.toFixed(decimals))}${suffix}`;
    }
  }
  return stripTrailingZeros(num.toFixed(2));
}

// ---------------------------------------------------------------------------
// USD
// ---------------------------------------------------------------------------

/**
 * Format a USD amount with crypto-convention smart precision.
 *
 * Rules:
 *   value >= 1e9    → "$1.2B"
 *   value >= 1e6    → "$3.5M"
 *   value >= 1e3    → "$215K"  (or "$1.23K" if < 10K)
 *   value >= 1      → "$12.50" (2 decimals)
 *   value >= 0.01   → "$0.42"  (2 decimals)
 *   value >= 0.0001 → "$0.00042" (show up to 7 decimals, trim trailing zeros)
 *   value < 0.0001  → subscript-zero notation: "$0.0₅73" meaning 5 zeros then 73
 *                     rendered as JSX with a <sub> element
 *   value === 0     → "$0.00"
 *   value is null/undefined/NaN → "—"
 *
 * Returns a ReactNode (not a string) because subscript rendering requires JSX.
 * For string-only contexts (titles, aria-labels), provide formatUsdText() below.
 */
export function formatUsd(value: number | null | undefined): ReactNode {
  if (isInvalid(value)) return createElement("span", { className: "font-mono" }, "—");
  if (value === 0) return createElement("span", { className: "font-mono" }, "$0.00");
  if (value < 0) {
    return createElement("span", { className: "font-mono" }, `-${formatUsdText(-value)}`);
  }

  // Large: billions
  if (value >= 1e9) {
    const scaled = value / 1e9;
    const decimals = scaled < 10 ? 2 : 1;
    return createElement("span", { className: "font-mono" }, `$${stripTrailingZeros(scaled.toFixed(decimals))}B`);
  }

  // Millions
  if (value >= 1e6) {
    const scaled = value / 1e6;
    const decimals = scaled < 10 ? 2 : 1;
    return createElement("span", { className: "font-mono" }, `$${stripTrailingZeros(scaled.toFixed(decimals))}M`);
  }

  // Thousands
  if (value >= 1e3) {
    const scaled = value / 1e3;
    const decimals = scaled < 10 ? 2 : 1;
    return createElement("span", { className: "font-mono" }, `$${stripTrailingZeros(scaled.toFixed(decimals))}K`);
  }

  // >= $1
  if (value >= 1) {
    return createElement("span", { className: "font-mono" }, `$${value.toFixed(2)}`);
  }

  // >= $0.01
  if (value >= 0.01) {
    return createElement("span", { className: "font-mono" }, `$${value.toFixed(2)}`);
  }

  // >= $0.0001
  if (value >= 0.0001) {
    let s = value.toFixed(7);
    s = s.replace(/0+$/, ""); // trim trailing zeros
    if (s.endsWith(".")) s += "0";
    return createElement("span", { className: "font-mono" }, `$${s}`);
  }

  // Sub-penny: subscript notation
  // e.g. 0.0000073 → "$0.0₅73"
  const str = value.toFixed(20);
  // Find first non-zero digit after decimal
  const m = str.match(/^0\.(0+)([1-9]\d*)/);
  if (m) {
    const zeros = m[1].length;
    const digits = m[2];
    return createElement(
      "span",
      { className: "font-mono numeric-subscript" },
      "$0.0",
      createElement("sub", null, zeros),
      digits
    );
  }

  // Fallback
  return createElement("span", { className: "font-mono" }, `$${value.toExponential(2)}`);
}

/**
 * String-only version of formatUsd. Subscript notation flattens to
 * "$0.0{5}73" format for screen readers and plain-text use.
 */
export function formatUsdText(value: number | null | undefined): string {
  if (isInvalid(value)) return "—";
  if (value === 0) return "$0.00";
  if (value < 0) return `-${formatUsdText(-value)}`;

  if (value >= 1e9) {
    const scaled = value / 1e9;
    const decimals = scaled < 10 ? 2 : 1;
    return `$${stripTrailingZeros(scaled.toFixed(decimals))}B`;
  }
  if (value >= 1e6) {
    const scaled = value / 1e6;
    const decimals = scaled < 10 ? 2 : 1;
    return `$${stripTrailingZeros(scaled.toFixed(decimals))}M`;
  }
  if (value >= 1e3) {
    const scaled = value / 1e3;
    const decimals = scaled < 10 ? 2 : 1;
    return `$${stripTrailingZeros(scaled.toFixed(decimals))}K`;
  }
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) {
    let s = value.toFixed(7);
    s = s.replace(/0+$/, "");
    if (s.endsWith(".")) s += "0";
    return `$${s}`;
  }

  const str = value.toFixed(20);
  const m = str.match(/^0\.(0+)([1-9]\d*)/);
  if (m) {
    const zeros = m[1].length;
    const digits = m[2].replace(/0+$/, "");
    return `$0.0{${zeros}}${digits}`;
  }

  return `$${value.toExponential(2)}`;
}

// ---------------------------------------------------------------------------
// Token Quantity
// ---------------------------------------------------------------------------

/**
 * Format a token quantity for display.
 *
 * Rules:
 *   value >= 1e9    → "1.2B"
 *   value >= 1e6    → "3.5M"
 *   value >= 1e3    → "191.3K"
 *   value >= 1      → "42.57" (2 decimals)
 *   value >= 0.01   → "0.42"
 *   value < 0.01    → up to 6 decimals, trim trailing zeros
 *   value === 0     → "0"
 *   value is null/undefined/NaN → "—"
 *
 * Never shows more than 4 significant characters before the suffix.
 */
export function formatTokenQty(value: number | null | undefined): string {
  if (isInvalid(value)) return "—";
  if (value === 0) return "0";
  if (value < 0) return `-${formatTokenQty(-value)}`;

  if (value >= 1e9) {
    const scaled = value / 1e9;
    return `${stripTrailingZeros(scaled < 10 ? scaled.toFixed(2) : scaled.toFixed(1))}B`;
  }
  if (value >= 1e6) {
    const scaled = value / 1e6;
    return `${stripTrailingZeros(scaled < 10 ? scaled.toFixed(2) : scaled.toFixed(1))}M`;
  }
  if (value >= 1e3) {
    const scaled = value / 1e3;
    return `${stripTrailingZeros(scaled < 10 ? scaled.toFixed(2) : scaled.toFixed(1))}K`;
  }
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(2);

  // < 0.01: up to 6 decimals, trim trailing zeros
  let s = value.toFixed(6);
  s = s.replace(/0+$/, "");
  if (s.endsWith(".")) s += "0";
  return s;
}

// ---------------------------------------------------------------------------
// Native Currency (ETH / SOL)
// ---------------------------------------------------------------------------

/**
 * Format a native-currency amount (ETH or SOL) with fixed precision.
 *
 * Rules:
 *   For values ≥ 0.01: 4 decimals — "0.5853 ETH"
 *   For values ≥ 0.0001: 6 decimals — "0.001234 ETH"
 *   For values < 0.0001: 8 decimals — "0.00001234 ETH"
 *   Always include the chain-native symbol.
 *   null/undefined/NaN → "—"
 */
export function formatNative(
  value: number | null | undefined,
  chain: "base" | "solana"
): string {
  if (isInvalid(value)) return "—";
  if (value === 0) return `0 ${chain === "solana" ? "SOL" : "ETH"}`;

  const symbol = chain === "solana" ? "SOL" : "ETH";
  const absValue = Math.abs(value);
  let formatted: string;

  if (absValue >= 0.01) {
    formatted = value.toFixed(4);
  } else if (absValue >= 0.0001) {
    formatted = value.toFixed(6);
  } else {
    formatted = value.toFixed(8);
  }

  return `${formatted} ${symbol}`;
}

// ---------------------------------------------------------------------------
// Percentage
// ---------------------------------------------------------------------------

/**
 * Format a signed percentage with explicit sign and 2 decimals.
 *   +2.44%, -2.44%, 0.00%
 */
export function formatPct(value: number | null | undefined): string {
  if (isInvalid(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Integer Count
// ---------------------------------------------------------------------------

/**
 * Format an integer count with locale-sensitive grouping (e.g. 1,234).
 * null/undefined/NaN → "—"
 */
export function formatCount(value: number | null | undefined): string {
  if (isInvalid(value)) return "—";
  return Math.round(value).toLocaleString();
}
