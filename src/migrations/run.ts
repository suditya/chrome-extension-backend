// src/migrations/run.ts
import { MongoClient } from 'mongodb';
import { config } from '../config/index.ts';
import { runBackfill } from './backfill.ts';

async function main() {
  console.log(`[Migration] Connecting to MongoDB: ${config.dbName}...`);
  const client = new MongoClient(config.mongoUri);
  await client.connect();

  try {
    const db = client.db(config.dbName);
    console.log('[Migration] Starting idempotent schema backfill...');
    const stats = await runBackfill(db);
    console.log('[Migration] Backfill completed successfully! Summary:');
    console.table(stats);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('[Migration] Migration failed:', err);
  process.exit(1);
});

