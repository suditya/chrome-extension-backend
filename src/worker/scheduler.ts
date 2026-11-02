// src/worker/scheduler.ts
import type { ReminderService } from '../modules/reminders/service.ts';
import type { IEmailTransport } from '../modules/notifications/types.ts';
import { buildReminderEmail } from '../modules/notifications/emailTemplate.ts';
import type { AppConfig } from '../config/index.ts';

export class NotificationScheduler {
  private reminderService: ReminderService;
  private transport: IEmailTransport;
  private config: AppConfig;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(reminderService: ReminderService, transport: IEmailTransport, config: AppConfig) {
    this.reminderService = reminderService;
    this.transport = transport;
    this.config = config;
  }

  start(): void {
    if (this.intervalTimer) return;
    console.log(`[Worker] Notification scheduler started (polling every ${this.config.workerIntervalMs / 1000}s).`);

    // Run first sweep immediately
    this.processDueReminders().catch((err) => console.error('[Worker] Initial sweep error:', err));

    this.intervalTimer = setInterval(() => {
      this.processDueReminders().catch((err) => console.error('[Worker] Periodic sweep error:', err));
    }, this.config.workerIntervalMs);
  }

  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log('[Worker] Notification scheduler stopped.');
    }
  }

  async processDueReminders(): Promise<{ delivered: number; failed: number; reclaimed: number }> {
    if (this.isProcessing) {
      return { delivered: 0, failed: 0, reclaimed: 0 };
    }

    this.isProcessing = true;
    let delivered = 0;
    let failed = 0;
    let reclaimed = 0;

    try {
      // 1. Reclaim stale leases from crashed workers
      reclaimed = await this.reminderService.reclaimStaleLeases(this.config.leaseTimeoutMs);
      if (reclaimed > 0) {
        console.warn(`[Worker] Reclaimed ${reclaimed} stale reminder lease(s) for retry.`);
      }

      // 2. Process all currently due reminders
      const attemptedIdsInSweep: any[] = [];

      while (true) {
        const reminder = await this.reminderService.claimNextDueReminder(attemptedIdsInSweep);
        if (!reminder) break;

        attemptedIdsInSweep.push(reminder._id);

        try {
          const emailOptions = buildReminderEmail({
            reminderId: reminder._id.toString(),
            recipientEmail: reminder.email,
            problemTitle: reminder.problemTitle,
            problemLink: reminder.problemLink,
            topic: reminder.topic || 'General',
            difficulty: reminder.difficulty || 'Medium',
            consecutiveIndependent: reminder.consecutiveIndependent || 0,
            publicUrlBase: this.config.backendPublicUrl,
            adminEmail: this.config.adminEmail,
          });

          const sendResult = await this.transport.sendMail(emailOptions);
          await this.reminderService.markDeliverySuccess(reminder._id, sendResult.messageId);
          delivered++;
          console.log(`[Worker] Delivered email to ${reminder.email} for "${reminder.problemTitle}" (id: ${sendResult.messageId})`);
        } catch (deliveryError: any) {
          failed++;
          const errMsg = deliveryError?.message || 'Unknown delivery failure';
          await this.reminderService.markDeliveryFailure(reminder._id, errMsg);
          console.error(`[Worker] Delivery failed for ${reminder.email}: ${errMsg}`);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { delivered, failed, reclaimed };
  }
}
