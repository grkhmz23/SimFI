import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { settleBets } from './settleBets';

const SETTLE_TICK_SEC_RAW = process.env.SPORTSBOOK_SCORES_TICK_SEC || '60';
const SETTLE_TICK_SEC = Number.isFinite(parseInt(SETTLE_TICK_SEC_RAW, 10))
  ? parseInt(SETTLE_TICK_SEC_RAW, 10)
  : 60;
const ADVISORY_LOCK_KEY = 987654324;

let settleTimer: NodeJS.Timeout | null = null;
let isRunning = false;

export function startSportsbookSettler(): void {
  if (settleTimer) return;
  console.log(`[sportsbook-settler] starting tick=${SETTLE_TICK_SEC}s`);

  runSettleLoop().catch((err) => console.error('[sportsbook-settler] initial run failed:', err));
  settleTimer = setInterval(() => {
    runSettleLoop().catch((err) => console.error('[sportsbook-settler] loop error:', err));
  }, SETTLE_TICK_SEC * 1000);
}

export function stopSportsbookSettler(): void {
  if (settleTimer) {
    clearInterval(settleTimer);
    settleTimer = null;
  }
  console.log('[sportsbook-settler] stopped');
}

async function runSettleLoop(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as acquired`);
    const acquired = (lockResult.rows[0] as any)?.acquired === true;
    if (!acquired) return;
    try {
      await settleBets();
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
    }
  } finally {
    isRunning = false;
  }
}
