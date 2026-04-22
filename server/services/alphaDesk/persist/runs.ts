import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import { alphaDeskRuns } from "@shared/schema";
import type { AlphaDeskChain } from "../types";

export async function insertAlphaDeskRun(params: {
  runDate: string;
  chain: AlphaDeskChain;
  status: "pending" | "succeeded" | "failed";
  sourcesUsed: Record<string, boolean>;
  llmProvider?: string;
  llmModel?: string;
  errorMessage?: string;
}): Promise<number> {
  const [row] = await db
    .insert(alphaDeskRuns)
    .values({
      runDate: params.runDate,
      chain: params.chain,
      status: params.status,
      sourcesUsed: params.sourcesUsed,
      llmProvider: params.llmProvider,
      llmModel: params.llmModel,
      startedAt: new Date(),
      errorMessage: params.errorMessage,
    })
    .returning({ id: alphaDeskRuns.id });

  return row.id;
}

export async function updateAlphaDeskRun(
  runId: number,
  updates: {
    status?: "pending" | "succeeded" | "failed";
    llmProvider?: string;
    llmModel?: string;
    completedAt?: Date;
    errorMessage?: string | null;
  }
): Promise<void> {
  await db
    .update(alphaDeskRuns)
    .set({
      ...updates,
      errorMessage: updates.errorMessage === null ? undefined : updates.errorMessage,
    })
    .where(eq(alphaDeskRuns.id, runId));
}

export async function findTodayRun(
  runDate: string,
  chain: AlphaDeskChain
): Promise<{ id: number; status: string } | undefined> {
  const rows = await db
    .select({ id: alphaDeskRuns.id, status: alphaDeskRuns.status })
    .from(alphaDeskRuns)
    .where(and(eq(alphaDeskRuns.runDate, runDate), eq(alphaDeskRuns.chain, chain)))
    .limit(1);

  return rows[0];
}

export async function countRunsToday(runDate: string, chain: AlphaDeskChain): Promise<number> {
  const rows = await db
    .select({ id: alphaDeskRuns.id })
    .from(alphaDeskRuns)
    .where(and(eq(alphaDeskRuns.runDate, runDate), eq(alphaDeskRuns.chain, chain)));

  return rows.length;
}
