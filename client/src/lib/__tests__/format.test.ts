import { describe, it, expect } from "vitest";
import {
  formatUsd,
  formatUsdText,
  formatTokenQty,
  formatNative,
  formatPct,
} from "../format.ts";

// Helper to extract text from a ReactNode returned by formatUsd
function usdText(node: ReturnType<typeof formatUsd>): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(usdText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = (node as any).props;
    const children = props.children;
    if (children === undefined || children === null) return "";
    if (Array.isArray(children)) return children.map(usdText).join("");
    return usdText(children);
  }
  return String(node);
}

describe("formatUsd", () => {
  it("renders null/undefined/NaN as —", () => {
    expect(usdText(formatUsd(null))).toBe("—");
    expect(usdText(formatUsd(undefined))).toBe("—");
    expect(usdText(formatUsd(NaN))).toBe("—");
  });

  it("renders 0 as $0.00", () => {
    expect(usdText(formatUsd(0))).toBe("$0.00");
  });

  it("renders billions", () => {
    expect(usdText(formatUsd(1_234_567_890))).toBe("$1.23B");
  });

  it("renders millions", () => {
    expect(usdText(formatUsd(3_200_000))).toBe("$3.2M");
  });

  it("renders thousands", () => {
    expect(usdText(formatUsd(215_000))).toBe("$215K");
    expect(usdText(formatUsd(1_230))).toBe("$1.23K");
  });

  it("renders >= 1 with 2 decimals", () => {
    expect(usdText(formatUsd(12.5))).toBe("$12.50");
  });

  it("renders >= 0.01 with 2 decimals", () => {
    expect(usdText(formatUsd(0.42))).toBe("$0.42");
  });

  it("renders >= 0.0001 with up to 7 decimals", () => {
    expect(usdText(formatUsd(0.0042))).toBe("$0.0042");
  });

  it("renders sub-penny with subscript notation", () => {
    const node = formatUsd(0.0000073);
    const text = usdText(node);
    expect(text).toContain("0.0");
    expect(text).toContain("73");
  });

  it("handles negative values", () => {
    expect(usdText(formatUsd(-12.5))).toBe("-$12.50");
  });
});

describe("formatUsdText", () => {
  it("matches formatUsd for string contexts", () => {
    expect(formatUsdText(null)).toBe("—");
    expect(formatUsdText(0)).toBe("$0.00");
    expect(formatUsdText(1_234_567_890)).toBe("$1.23B");
    expect(formatUsdText(3_200_000)).toBe("$3.2M");
    expect(formatUsdText(215_000)).toBe("$215K");
    expect(formatUsdText(12.5)).toBe("$12.50");
    expect(formatUsdText(0.42)).toBe("$0.42");
    expect(formatUsdText(0.0042)).toBe("$0.0042");
  });

  it("flattens subscript to brace notation", () => {
    expect(formatUsdText(0.0000073)).toBe("$0.0{5}73");
  });
});

describe("formatTokenQty", () => {
  it("renders null/undefined/NaN as —", () => {
    expect(formatTokenQty(null)).toBe("—");
    expect(formatTokenQty(undefined)).toBe("—");
    expect(formatTokenQty(NaN)).toBe("—");
  });

  it("renders 0 as 0", () => {
    expect(formatTokenQty(0)).toBe("0");
  });

  it("renders billions", () => {
    expect(formatTokenQty(1_200_000_000)).toBe("1.2B");
  });

  it("renders millions", () => {
    expect(formatTokenQty(3_500_000)).toBe("3.5M");
  });

  it("renders thousands", () => {
    expect(formatTokenQty(191289.62)).toBe("191.3K");
  });

  it("renders >= 1 with 2 decimals", () => {
    expect(formatTokenQty(42.567)).toBe("42.57");
  });

  it("renders >= 0.01 with 2 decimals", () => {
    expect(formatTokenQty(0.42)).toBe("0.42");
  });

  it("renders < 0.01 up to 6 decimals", () => {
    expect(formatTokenQty(0.0001)).toBe("0.0001");
  });

  it("handles negative values", () => {
    expect(formatTokenQty(-42.567)).toBe("-42.57");
  });
});

describe("formatNative", () => {
  it("renders null/undefined/NaN as —", () => {
    expect(formatNative(null, "base")).toBe("—");
    expect(formatNative(undefined, "solana")).toBe("—");
    expect(formatNative(NaN, "base")).toBe("—");
  });

  it("renders 0 with symbol", () => {
    expect(formatNative(0, "base")).toBe("0 ETH");
    expect(formatNative(0, "solana")).toBe("0 SOL");
  });

  it("renders >= 0.01 with 4 decimals", () => {
    expect(formatNative(0.5853, "base")).toBe("0.5853 ETH");
    expect(formatNative(0.5853, "solana")).toBe("0.5853 SOL");
  });

  it("renders >= 0.0001 with 6 decimals", () => {
    expect(formatNative(0.001234, "base")).toBe("0.001234 ETH");
  });

  it("renders < 0.0001 with 8 decimals", () => {
    expect(formatNative(0.00001234, "base")).toBe("0.00001234 ETH");
  });

  it("renders larger values correctly", () => {
    expect(formatNative(4.4, "base")).toBe("4.4000 ETH");
  });
});

describe("formatPct", () => {
  it("renders null/undefined/NaN as —", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
    expect(formatPct(NaN)).toBe("—");
  });

  it("renders zero as +0.00%", () => {
    expect(formatPct(0)).toBe("+0.00%");
  });

  it("renders positive with + sign", () => {
    expect(formatPct(2.44)).toBe("+2.44%");
  });

  it("renders negative with - sign", () => {
    expect(formatPct(-2.44)).toBe("-2.44%");
  });
});
