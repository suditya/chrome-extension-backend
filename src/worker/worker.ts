// src/worker/worker.ts
import { MongoClient } from 'mongodb';
import { config } from '../config/index.ts';
import { ReminderService } from '../modules/reminders/service.ts';
import { NodemailerTransport } from '../modules/notifications/transport.ts';
import { NotificationScheduler } from './scheduler.ts';

async function runWorker() {
  console.log(`[Worker Process] Initializing standalone background worker in ${config.nodeEnv} mode...`);

  const mongoClient = new MongoClient(config.mongoUri);
  await mongoClient.connect();
  const db = mongoClient.db(config.dbName);
  console.log(`[Worker Process] Connected to MongoDB database: "${config.dbName}"`);

  const reminderService = new ReminderService(db);
  await reminderService.ensureIndexes();

  const transport = new NodemailerTransport(config.adminEmail, config.adminPass);
  const scheduler = new NotificationScheduler(reminderService, transport, config);

  scheduler.start();

  const shutdown = async (signal: string) => {
    console.log(`[Worker Process] Received ${signal}. Stopping scheduler...`);
    scheduler.stop();
    try {
      await mongoClient.close();
      console.log('[Worker Process] MongoDB connection closed.');
    } catch (e) {
      console.error('[Worker Process] Error closing DB:', e);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

runWorker().catch((err) => {
  console.error('[Worker Process] Fatal error starting worker:', err);
  process.exit(1);
});

