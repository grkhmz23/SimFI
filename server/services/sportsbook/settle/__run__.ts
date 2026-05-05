import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { settleBets } from './settleBets';

const ADVISORY_LOCK_KEY = 987654324;

async function main() {
  const lockResult = await db.execute(
    sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as acquired`
  );
  const acquired = (lockResult.rows[0] as any)?.acquired === true;
  if (!acquired) {
    console.error('Another settler instance is already running (advisory lock held). Exiting.');
    process.exit(1);
  }

  try {
    await settleBets();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
