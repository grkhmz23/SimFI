import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@shared/schema';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Maximum 20 connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Timeout for new connections
  // SSL configuration — enabled by default, opt-out via DISABLE_DB_SSL=true
  ssl: process.env.DISABLE_DB_SSL === 'true' ? undefined : {
    rejectUnauthorized: true
  }
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });
