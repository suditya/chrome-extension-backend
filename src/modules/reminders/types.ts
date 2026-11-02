// src/modules/reminders/types.ts
import type { ObjectId } from 'mongodb';
import type { ProblemDifficulty } from '../problems/types.ts';
import type { ReviewOutcome } from '../../revision-engine/types.ts';

export type ReminderStatus = 'active' | 'mastered' | 'cancelled';
export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface ReviewHistoryEntry {
  outcome: ReviewOutcome;
  reviewedAt: Date;
  nextIntervalDays: number;
  policyVersion?: string;
}

export interface EmailDeliveryState {
  status: DeliveryStatus;
  sentAt: Date | null;
  attemptCount: number;
  lastError: string | null;
  lockedAt?: Date | null;
  providerMessageId?: string | null;
}

export interface ReminderDocument {
  _id: ObjectId;
  email: string;
  problemLink: string;
  problemSlug: string;
  problemTitle: string;
  topic: string;
  difficulty: ProblemDifficulty;
  status: ReminderStatus;
  reviewCount: number;
  consecutiveIndependent: number;
  lastReviewedAt: Date | null;
  lastOutcome: ReviewOutcome | null;
  nextReviewAt: Date;
  history: ReviewHistoryEntry[];
  emailDelivery: EmailDeliveryState;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveReminderInput {
  email: string;
  problemLink: string;
  problemTitle: string;
  topic?: string;
  difficulty?: string;
  initialDays?: number;
}

export interface RecordReviewInput {
  id?: string;
  email?: string;
  problemLink?: string;
  outcome: string;
  baseDate?: Date;
}

