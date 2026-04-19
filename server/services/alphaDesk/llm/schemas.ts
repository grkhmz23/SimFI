import { z } from "zod";

export const RiskLevelSchema = z.enum(["low", "medium", "high"]);
export const CategorySchema = z.enum(["utility", "meme"]);
export const ChainSchema = z.enum(["base", "solana"]);

export const AlphaDeskIdeaSchema = z.object({
  narrative_title: z.string().min(5).max(200),
  token_name: z.string().min(1).max(100),
  ticker: z.string().regex(/^[A-Z0-9]+$/).min(2).max(10),
  thesis: z.string().min(30).max(800),
  why_now: z.string().min(10).max(500),
  twitter_evidence: z.array(z.string().min(1)).min(0).max(5),
  risk_flags: z.array(z.string().min(1)).min(1).max(6),
  confidence: z.number().int().min(0).max(100),
  chain: ChainSchema,
  token_address: z.string().min(20).max(64),
  category: CategorySchema,
  risk_level: RiskLevelSchema,
});

export const AlphaDeskIdeasResponseSchema = z.object({
  ideas: z.array(AlphaDeskIdeaSchema).min(3).max(5),
});

export type AlphaDeskIdeaResponse = z.infer<typeof AlphaDeskIdeaSchema>;
export type AlphaDeskIdeasResponse = z.infer<typeof AlphaDeskIdeasResponseSchema>;
