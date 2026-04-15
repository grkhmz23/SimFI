import type { Chain } from "@shared/schema";

export function getTokenExplorerUrl(chain: Chain, tokenAddress: string): string {
  if (chain === "base") {
    return `https://basescan.org/token/${tokenAddress}`;
  }
  return `https://solscan.io/token/${tokenAddress}`;
}

export function getTxExplorerUrl(chain: Chain, signature: string): string {
  if (chain === "base") {
    return `https://basescan.org/tx/${signature}`;
  }
  return `https://solscan.io/tx/${signature}`;
}

export function getAccountExplorerUrl(chain: Chain, address: string): string {
  if (chain === "base") {
    return `https://basescan.org/address/${address}`;
  }
  return `https://solscan.io/account/${address}`;
}

export function getExplorerLabel(chain: Chain): string {
  return chain === "base" ? "BaseScan" : "Solscan";
}
