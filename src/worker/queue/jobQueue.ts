// src/worker/queue/jobQueue.ts
import { EventEmitter } from 'node:events';
import type { NotificationJobData, JobExecutionResult } from './types.ts';
import type { IEmailTransport } from '../../modules/notifications/types.ts';
import { buildReminderEmail } from '../../modules/notifications/emailTemplate.ts';

export function generateJobId(reminderId: string, scheduledFor: Date | string): string {
  const ts = new Date(scheduledFor).getTime();
  return `notify_${reminderId}_${ts}`;
}

export interface QueueConfig {
  maxRetries: number;
  initialBackoffMs: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxRetries: 5,
  initialBackoffMs: 1000,
};

/**
 * Resilient Job Queue abstraction with deterministic deduplication,
 * exponential backoff, and job-level correlation ID tracing.
 */
export class NotificationQueue extends EventEmitter {
  private queue: NotificationJobData[] = [];
  private jobIndex: Map<string, NotificationJobData> = new Map();
  private completedJobs: Set<string> = new Set();
  private isProcessing = false;
  private config: QueueConfig;

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Enqueues a notification job with deterministic ID deduplication.
   * Returns true if added, false if deduplicated.
   */
  async enqueue(data: NotificationJobData): Promise<boolean> {
    const { jobId } = data;

    // Idempotency: Skip if already queued or previously completed
    if (this.jobIndex.has(jobId) || this.completedJobs.has(jobId)) {
      console.log(`[Queue] Deduplicating job ${jobId} (already in-flight or completed)`);
      return false;
    }

    this.jobIndex.set(jobId, data);
    this.queue.push(data);
    this.emit('job:enqueued', data);
    return true;
  }

  size(): number {
    return this.queue.length;
  }

  /**
   * Processes a single job using the given transport and handler callbacks.
   */
  async processNextJob(
    transport: IEmailTransport,
    onSuccess: (job: NotificationJobData, result: JobExecutionResult) => Promise<void>,
    onFailure: (job: NotificationJobData, error: string, willRetry: boolean) => Promise<void>
  ): Promise<JobExecutionResult | null> {
    const job = this.queue.shift();
    if (!job) return null;

    const correlationId = job.correlationId || `corr-${Date.now()}`;
    console.log(`[Worker][${correlationId}] Processing notification job ${job.jobId} for ${job.recipientEmail}`);

    const emailOptions = buildReminderEmail({
      reminderId: job.reminderId,
      recipientEmail: job.recipientEmail,
      problemTitle: job.problemTitle,
      problemLink: job.problemLink,
      topic: job.topic,
      difficulty: job.difficulty,
      consecutiveIndependent: job.consecutiveIndependent,
      publicUrlBase: job.publicUrlBase,
      adminEmail: job.adminEmail,
    });

    try {
      const sendResult = await transport.sendMail(emailOptions);

      const result: JobExecutionResult = {
        success: true,
        messageId: sendResult.messageId,
        attemptCount: job.attemptCount + 1,
        processedAt: new Date(),
      };

      this.jobIndex.delete(job.jobId);
      this.completedJobs.add(job.jobId);

      await onSuccess(job, result);
      console.log(`[Worker][${correlationId}] Successfully dispatched ${job.jobId} (MsgId: ${sendResult.messageId})`);
      return result;
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown email delivery error';
      job.attemptCount += 1;
      const willRetry = job.attemptCount < this.config.maxRetries;

      console.error(`[Worker][${correlationId}] Delivery failed for ${job.jobId} (attempt ${job.attemptCount}/${this.config.maxRetries}): ${errorMsg}`);

      await onFailure(job, errorMsg, willRetry);

      if (willRetry) {
        // Exponential backoff
        const backoffDelay = this.config.initialBackoffMs * Math.pow(2, job.attemptCount - 1);
        console.log(`[Worker][${correlationId}] Scheduling retry for ${job.jobId} in ${backoffDelay}ms`);

        setTimeout(() => {
          this.queue.push(job);
        }, backoffDelay);
      } else {
        // Dead letter
        this.jobIndex.delete(job.jobId);
        console.error(`[Worker][${correlationId}] Job ${job.jobId} exceeded max retries. Moved to dead-letter.`);
      }

      return {
        success: false,
        error: errorMsg,
        attemptCount: job.attemptCount,
        processedAt: new Date(),
      };
    }
  }
}

