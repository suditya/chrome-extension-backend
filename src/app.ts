// src/app.ts
import express from 'express';
import cors from 'cors';
import { createApiRouter } from './routes/index.ts';
import { requestLogger } from './middleware/logger.ts';
import { errorHandler, AppError } from './middleware/errorHandler.ts';
import type { ReminderService } from './modules/reminders/service.ts';
import type { AppConfig } from './config/index.ts';

export function createApp(reminderService: ReminderService, config: AppConfig): express.Application {
  const app = express();

  app.set('trust proxy', 1);

  // CORS
  const allowedOrigins = config.corsOrigin.split(',').map((s) => s.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://')) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logger
  app.use(requestLogger);

  // Mount API router
  app.use('/', createApiRouter(reminderService));

  // 404 handler
  app.use((_req, _res, next) => {
    next(new AppError('Endpoint not found', 404));
  });

  // Central error handler
  app.use(errorHandler);

  return app;
}

