/**
 * Price decimal converter utility
 *
 * Prices are stored in the database as numeric(38, 18) decimal strings
 * representing "native tokens per whole token" (e.g., 0.000000071 SOL per Bonk).
 *
 * Internal business logic continues to use atomic units (bigint) for math:
 * - Solana: lamports per whole token
 * - Base: wei per whole token
 *
 * These converters are used ONLY at the persistence boundary (storage layer).
 */

/**
 * Convert an atomic price (lamports or wei per whole token) to a decimal string
 * suitable for storage in numeric(38, 18).
 *
 * Example:
 *   atomicToDecimal(71n, 9)  -> "0.000000071"
 *   atomicToDecimal(10n**18n, 18) -> "1.000000000000000000"
 */
export function atomicToDecimal(
  atomicPrice: bigint,
  nativeDecimals: number
): string {
  if (atomicPrice === 0n) {
    return "0." + "0".repeat(nativeDecimals);
  }

  const divisor = 10n ** BigInt(nativeDecimals);
  const isNegative = atomicPrice < 0n;
  const absPrice = isNegative ? -atomicPrice : atomicPrice;

  const wholePart = absPrice / divisor;
  const fracPart = absPrice % divisor;

  const fracStr = fracPart.toString().padStart(nativeDecimals, "0");

  const sign = isNegative ? "-" : "";
  return `${sign}${wholePart}.${fracStr}`;
}

/**
 * Convert a decimal price from the database back to atomic units (bigint).
 *
 * BACKWARD COMPATIBILITY: Old positions stored raw atomic integers (e.g. "7435").
 * New positions store decimal strings (e.g. "0.000007435").
 * Since atomicToDecimal always outputs a ".", any value without "." is old format.
 *
 * Example:
 *   decimalToAtomic("0.000000071", 9)  -> 71n
 *   decimalToAtomic("1.000000000000000000", 18) -> 1000000000000000000n
 *   decimalToAtomic("7435", 9)         -> 7435n  (legacy raw atomic)
 */
export function decimalToAtomic(
  decimalPrice: string,
  nativeDecimals: number
): bigint {
  const trimmed = decimalPrice.trim();
  if (!trimmed || trimmed === "0") return 0n;

  const isNegative = trimmed.startsWith("-");
  const absStr = isNegative ? trimmed.slice(1) : trimmed;

  // ✅ BACKWARD COMPAT: Old DB rows store raw atomic integers without "."
  // atomicToDecimal always produces a decimal point (e.g. 1n -> "0.000000001")
  if (!absStr.includes(".")) {
    return isNegative ? -BigInt(absStr) : BigInt(absStr);
  }

  const [wholeStr, fracStr = ""] = absStr.split(".");
  const wholePart = wholeStr ? BigInt(wholeStr) : 0n;

  const paddedFrac = fracStr
    .padEnd(nativeDecimals, "0")
    .slice(0, nativeDecimals);
  const fracPart = paddedFrac ? BigInt(paddedFrac) : 0n;

  const atomic = wholePart * 10n ** BigInt(nativeDecimals) + fracPart;

  return isNegative ? -atomic : atomic;
}
