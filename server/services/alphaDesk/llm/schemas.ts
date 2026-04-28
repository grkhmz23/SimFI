import { z } from "zod";

export const MemeLaunchIdeaSchema = z.object({
  title: z.string().min(1),
  token_name: z.string().min(1),
  ticker: z.string().min(1).max(10),
  thesis: z.string().min(1),
  why_now: z.string().min(1),
  meme_theme: z.string().min(1),
  reddit_inspiration: z.array(z.string()),
  twitter_narrative: z.string(),
  market_signal: z.string(),
  risk_flags: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  category: z.enum(["meme", "culture", "political", "tech"]),
  risk_level: z.enum(["low", "medium", "high"]),
});

export const DevBuildIdeaSchema = z.object({
  title: z.string().min(1),
  project_name: z.string().min(1),
  concept: z.string().min(1),
  why_now: z.string().min(1),
  target_audience: z.string().min(1),
  suggested_stack: z.array(z.string()),
  complexity: z.enum(["weekend", "sprint", "quarter"]),
  monetization: z.string().min(1),
  evidence: z.array(z.string()),
  risk_flags: z.array(z.string()).optional().default([]),
  risk_level: z.enum(["low", "medium", "high"]).optional().default("medium"),
  confidence: z.number().min(0).max(100),
});

export const MemeLaunchResponseSchema = z.object({
  ideas: z.array(MemeLaunchIdeaSchema).min(3).max(5),
});

export const DevBuildResponseSchema = z.object({
  ideas: z.array(DevBuildIdeaSchema).min(3).max(5),
});
