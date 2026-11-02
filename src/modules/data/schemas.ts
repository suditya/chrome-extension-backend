// src/modules/data/schemas.ts
import type { ObjectId } from 'mongodb';
import type { ReviewOutcome } from '../../revision-engine/types.ts';
import type { ProblemDifficulty } from '../problems/types.ts';
import type { ReminderStatus, DeliveryStatus } from '../reminders/types.ts';

export interface ProblemDoc {
  _id: ObjectId;
  slug: string;
  canonicalUrl: string;
  title: string;
  difficulty: ProblemDifficulty;
  topics: string[];
  source: 'leetcode';
  createdAt: Date;
  updatedAt: Date;
}

export interface ReminderDoc {
  _id: ObjectId;
  userId: string;
  problemId: ObjectId;
  status: ReminderStatus;
  nextReviewAt: Date;
  timezone: string;
  consecutiveIndependent: number;
  totalReviews: number;
  lastOutcome: ReviewOutcome | null;
  lastReviewedAt: Date | null;
  notificationPreferences: {
    channel: 'email';
    enabled: boolean;
  };
  cancelledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewAttemptDoc {
  _id: ObjectId;
  userId: string;
  problemId: ObjectId;
  reminderId: ObjectId;
  attemptedAt: Date;
  outcome: ReviewOutcome;
  notes: string | null;
  previousScheduledAt: Date;
  nextScheduledAt: Date;
  previousIntervalDays: number;
  nextIntervalDays: number;
  policyVersion: string;
  createdAt: Date;
}

export interface NotificationDeliveryDoc {
  _id: ObjectId;
  notificationId: string; // Stable deduplication key: `${reminderId}_${scheduledFor.getTime()}`
  reminderId: ObjectId;
  userId: string;
  scheduledFor: Date;
  channel: 'email';
  status: DeliveryStatus | 'dead_letter';
  attemptCount: number;
  sentAt: Date | null;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

