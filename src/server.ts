// src/server.ts
import { MongoClient } from 'mongodb';
import { createApp } from './app.ts';
import { config } from './config/index.ts';
import { ReminderService } from './modules/reminders/service.ts';
import { NodemailerTransport } from './modules/notifications/transport.ts';
import { NotificationScheduler } from './worker/scheduler.ts';

async function bootstrap() {
  console.log(`[Bootstrap] Initializing LeetCode Revision OS API in ${config.nodeEnv} mode...`);

  // Connect to MongoDB
  const mongoClient = new MongoClient(config.mongoUri);
  await mongoClient.connect();
  const db = mongoClient.db(config.dbName);
  console.log(`[Bootstrap] Connected to MongoDB database: "${config.dbName}"`);

  // Initialize Reminder Service & ensure indexes
  const reminderService = new ReminderService(db);
  await reminderService.ensureIndexes();

  // Initialize Email Transport
  const emailTransport = new NodemailerTransport(config.adminEmail, config.adminPass);

  // Initialize Express App
  const app = createApp(reminderService, config);

  // Start HTTP Server
  const server = app.listen(config.port, () => {
    console.log(`[HTTP] LeetCode Revision OS API listening on port ${config.port}`);
  });

  // Start Worker Scheduler
  const scheduler = new NotificationScheduler(reminderService, emailTransport, config);
  scheduler.start();

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] Received ${signal}. Starting graceful shutdown...`);
    scheduler.stop();

    server.close(async () => {
      console.log('[Shutdown] HTTP server closed.');
      try {
        await mongoClient.close();
        console.log('[Shutdown] MongoDB connection closed.');
      } catch (err) {
        console.error('[Shutdown] Error closing MongoDB:', err);
      }
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error('[Shutdown] Forced shutdown due to timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal startup error:', err);
  process.exit(1);
});

