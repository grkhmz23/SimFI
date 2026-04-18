/**
 * One-shot migration script:
 * Converts existing price columns from atomic units (lamports/wei)
 * to decimal native tokens (SOL/ETH) per whole token.
 *
 * Run with: npx tsx scripts/migrate-prices.ts
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('🔄 Starting price migration...');

  // Migrate positions.entry_price
  const positionsResult = await db.execute(sql`
    UPDATE positions
    SET entry_price = ROUND((entry_price / power(10, CASE WHEN chain = 'solana' THEN 9 ELSE 18 END))::numeric, 18)
  `);
  console.log(`✅ Migrated ${positionsResult.rowCount} positions`);

  // Migrate trade_history.entry_price and exit_price
  const tradesResult = await db.execute(sql`
    UPDATE trade_history
    SET
      entry_price = ROUND((entry_price / power(10, CASE WHEN chain = 'solana' THEN 9 ELSE 18 END))::numeric, 18),
      exit_price = ROUND((exit_price / power(10, CASE WHEN chain = 'solana' THEN 9 ELSE 18 END))::numeric, 18)
  `);
  console.log(`✅ Migrated ${tradesResult.rowCount} trades`);

  console.log('🎉 Migration complete');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
