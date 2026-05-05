import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { ingestOdds } from './ingestOdds';
import { ingestScores } from './ingestScores';

const ODDS_TICK_SEC_RAW = process.env.SPORTSBOOK_ODDS_TICK_SEC || '60';
const SCORES_TICK_SEC_RAW = process.env.SPORTSBOOK_SCORES_TICK_SEC || '60';
const ODDS_TICK_SEC = Number.isFinite(parseInt(ODDS_TICK_SEC_RAW, 10)) ? parseInt(ODDS_TICK_SEC_RAW, 10) : 60;
const SCORES_TICK_SEC = Number.isFinite(parseInt(SCORES_TICK_SEC_RAW, 10)) ? parseInt(SCORES_TICK_SEC_RAW, 10) : 60;
const ODDS_LOCK_KEY = 987654322;
const SCORES_LOCK_KEY = 987654323;

let oddsTimer: NodeJS.Timeout | null = null;
let scoresTimer: NodeJS.Timeout | null = null;
let isOddsRunning = false;
let isScoresRunning = false;

export function startSportsbookIngest(): void {
  if (oddsTimer || scoresTimer) return;
  console.log(`[sportsbook-ingest] starting oddsTick=${ODDS_TICK_SEC}s scoresTick=${SCORES_TICK_SEC}s`);

  // Run odds immediately, then on interval
  runOddsLoop().catch((err) => console.error('[sportsbook-ingest] initial odds run failed:', err));
  oddsTimer = setInterval(() => {
    runOddsLoop().catch((err) => console.error('[sportsbook-ingest] odds loop error:', err));
  }, ODDS_TICK_SEC * 1000);

  // Run scores immediately, then on interval
  runScoresLoop().catch((err) => console.error('[sportsbook-ingest] initial scores run failed:', err));
  scoresTimer = setInterval(() => {
    runScoresLoop().catch((err) => console.error('[sportsbook-ingest] scores loop error:', err));
  }, SCORES_TICK_SEC * 1000);
}

export function stopSportsbookIngest(): void {
  if (oddsTimer) {
    clearInterval(oddsTimer);
    oddsTimer = null;
  }
  if (scoresTimer) {
    clearInterval(scoresTimer);
    scoresTimer = null;
  }
  console.log('[sportsbook-ingest] stopped');
}

async function runOddsLoop(): Promise<void> {
  if (isOddsRunning) return;
  isOddsRunning = true;
  try {
    const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${ODDS_LOCK_KEY}) as acquired`);
    const acquired = (lockResult.rows[0] as any)?.acquired === true;
    if (!acquired) return;
    try {
      await ingestOdds();
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${ODDS_LOCK_KEY})`);
    }
  } finally {
    isOddsRunning = false;
  }
}

async function runScoresLoop(): Promise<void> {
  if (isScoresRunning) return;
  isScoresRunning = true;
  try {
    const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${SCORES_LOCK_KEY}) as acquired`);
    const acquired = (lockResult.rows[0] as any)?.acquired === true;
    if (!acquired) return;
    try {
      await ingestScores();
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${SCORES_LOCK_KEY})`);
    }
  } finally {
    isScoresRunning = false;
  }
}
