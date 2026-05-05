import { z } from "zod";

export const PlaceBetRequest = z.object({
  eventId: z.string().min(1),
  selection: z.enum(["home", "away", "draw"]),
  chain: z.enum(["solana", "base"]),
  stake: z.string().min(1), // decimal string to avoid float
  expectedOdds: z.number().positive().finite(),
  slippageBps: z.number().int().min(0).max(10000).default(100),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export type PlaceBetRequestType = z.infer<typeof PlaceBetRequest>;
