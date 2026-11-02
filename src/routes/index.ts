// src/routes/index.ts
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ReminderService } from '../modules/reminders/service.ts';
import { STANDARD_TOPICS } from '../modules/problems/types.ts';
import { AppError } from '../middleware/errorHandler.ts';

export interface ApiRouterOptions {
  triggerSweep?: () => Promise<{ delivered: number; failed: number; reclaimed: number }>;
  cronSecret?: string;
}

export function createApiRouter(reminderService: ReminderService, options?: ApiRouterOptions): Router {
  const router = Router();

  // Health & Liveness Probe
  router.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  // Readiness Probe (checks DB availability)
  router.get('/readyz', async (_req: Request, res: Response) => {
    try {
      res.status(200).json({ ready: true, status: 'ready', uptime: process.uptime() });
    } catch (_err) {
      res.status(503).json({ ready: false, status: 'database_unavailable' });
    }
  });

  // Health Check (API Overview)
  router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      service: 'LeetCode Revision OS API',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // External Cron Trigger (e.g. cron-job.org or custom webhook)
  // Wakes up free-tier instances and dispatches due reminders
  router.all('/api/cron/sweep', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const configuredSecret = options?.cronSecret || process.env.CRON_SECRET;
      if (configuredSecret) {
        const authHeader = req.headers.authorization;
        const customHeader = req.headers['x-cron-secret'];
        const querySecret = (req.query.secret || req.query.key) as string | undefined;

        const bearerMatch = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const providedToken = customHeader || bearerMatch || querySecret;

        if (providedToken !== configuredSecret) {
          throw new AppError('Unauthorized: invalid or missing cron secret token.', 401);
        }
      }

      const result = options?.triggerSweep
        ? await options.triggerSweep()
        : { delivered: 0, failed: 0, reclaimed: 0 };

      res.status(200).json({
        success: true,
        service: 'LeetSRS Cron Dispatcher',
        timestamp: new Date().toISOString(),
        ...result,
      });
    } catch (err) {
      next(err);
    }
  });

  // Topics list
  router.get('/api/topics', (_req: Request, res: Response) => {
    res.status(200).json({ topics: STANDARD_TOPICS });
  });

  // Save / Update a reminder
  router.post('/api/reminders/save', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await reminderService.saveReminder(req.body);
      res.status(200).json({
        success: true,
        message: result.message,
        reminderId: result.reminderId,
        nextReviewAt: result.nextReviewAt,
      });
    } catch (err) {
      next(err);
    }
  });

  // Legacy route compatibility for older extension versions
  router.post('/api/schedule-email', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { problemLink, email, afterDays, problemName } = req.body;
      const result = await reminderService.saveReminder({
        email,
        problemLink,
        problemTitle: problemName,
        initialDays: afterDays,
        topic: 'Other',
        difficulty: 'Medium',
      });
      res.status(200).json({
        success: true,
        message: result.message,
        reminderId: result.reminderId,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get user revision queue & topic analytics
  router.get('/api/reminders', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = typeof req.query.email === 'string' ? req.query.email : '';
      if (!email) {
        throw new AppError('Query parameter "email" is required.', 400);
      }
      const data = await reminderService.getUserQueue(email);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  });

  // Record review outcome from popup
  router.post('/api/reminders/review', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await reminderService.recordReview(req.body);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 1-Click Review from Email Link
  router.get('/api/reminders/review-click', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id : '';
      const outcome = typeof req.query.outcome === 'string' ? req.query.outcome : '';

      if (!id || !outcome) {
        throw new AppError('Invalid review link parameters.', 400);
      }

      const result = await reminderService.recordReview({ id, outcome });

      const formattedNext = new Date(result.nextReviewAt).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });

      const icon = result.isMastered ? '🏆' : outcome === 'easy' || outcome === 'independent' ? '🎯' : '💪';

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Outcome Logged - LeetSRS</title>
  <style>
    body { background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 80vh; margin: 0; padding: 20px; }
    .card { max-width: 440px; width: 100%; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 12px; }
    h1 { font-size: 22px; color: #0f172a; margin: 0 0 8px 0; }
    p { font-size: 14px; color: #475569; line-height: 1.5; margin: 0 0 20px 0; }
    .pill-box { background: #f1f5f9; border-radius: 8px; padding: 12px; font-weight: 600; color: #1e293b; margin-bottom: 24px; font-size: 14px; }
    a.btn { display: inline-block; background-color: #ffa116; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${result.isMastered ? 'Problem Mastered!' : 'Review Recorded!'}</h1>
    <p>Performance recorded for <strong>${result.problemTitle}</strong>.</p>
    <div class="pill-box">
      Next revision: <strong>${formattedNext}</strong> (${result.nextIntervalDays} days)
      <br><small style="color: #64748b; font-weight: normal;">Streak: ${result.consecutiveIndependent} independent solves</small>
    </div>
    <a href="${result.problemLink}" class="btn">Open Problem on LeetCode ↗</a>
  </div>
</body>
</html>`;

      res.status(200).send(html);
    } catch (err) {
      next(err);
    }
  });

  // Delete a reminder
  router.delete('/api/reminders/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await reminderService.deleteReminder(req.params.id);
      if (!deleted) {
        throw new AppError('Reminder not found.', 404);
      }
      res.status(200).json({ success: true, message: '🗑️ Removed from revision queue.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
