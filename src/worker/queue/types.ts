// src/worker/queue/types.ts

export interface NotificationJobData {
  jobId: string; // Deterministic deduplication key: `job-${reminderId}-${new Date(scheduledFor).getTime()}`
  correlationId: string;
  reminderId: string;
  recipientEmail: string;
  problemTitle: string;
  problemLink: string;
  topic: string;
  difficulty: string;
  consecutiveIndependent: number;
  scheduledFor: string;
  publicUrlBase: string;
  adminEmail: string;
  attemptCount: number;
}

export interface JobExecutionResult {
  success: boolean;
  messageId?: string;
  error?: string;
  attemptCount: number;
  processedAt: Date;
}

