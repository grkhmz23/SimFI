import { z } from "zod";

export const QuoteRequest = z.object({
  conditionId: z.string().min(1),
  outcome: z.enum(["YES", "NO"]),
  side: z.enum(["BUY", "SELL"]),
  shares: z.number().positive().finite().optional(),
  notionalUsd: z.number().positive().finite().optional(),
}).refine(
  (v) => (v.shares !== undefined) !== (v.notionalUsd !== undefined),
  { message: "Provide exactly one of shares or notionalUsd" },
).refine(
  (v) => v.side === "BUY" || v.shares !== undefined,
  { message: "SELL requires shares" },
);

export const TradeRequest = z.object({
  quoteId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export type QuoteRequestType = z.infer<typeof QuoteRequest>;
export type TradeRequestType = z.infer<typeof TradeRequest>;
