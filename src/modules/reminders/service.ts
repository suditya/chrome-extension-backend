// src/modules/reminders/service.ts
import { ObjectId, Collection, Db } from 'mongodb';
import type {
  ReminderDocument,
  SaveReminderInput,
  RecordReviewInput,
  ReminderStatus,
} from './types.ts';
import { determineReminderStatus } from './stateMachine.ts';
import { calculateReviewInterval, normalizeOutcome } from '../../revision-engine/index.ts';
import {
  canonicalizeUrl,
  extractSlug,
  cleanProblemTitle,
  normalizeDifficulty,
  normalizeTopic,
  isLeetCodeUrl,
} from '../problems/url.ts';
import { AppError } from '../../middleware/errorHandler.ts';

const COLLECTION_NAME = 'scheduledEmails';

export class ReminderService {
  private collection: Collection<ReminderDocument>;

  constructor(db: Db) {
    this.collection = db.collection<ReminderDocument>(COLLECTION_NAME);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ nextReviewAt: 1, status: 1 });
    await this.collection.createIndex({ email: 1, problemLink: 1 });
    await this.collection.createIndex({ email: 1, nextReviewAt: 1 });
    await this.collection.createIndex({ 'emailDelivery.status': 1, nextReviewAt: 1 });
    await this.collection.createIndex({ 'emailDelivery.lockedAt': 1 });
  }

  async saveReminder(input: SaveReminderInput) {
    const { email, problemLink, problemTitle, topic, difficulty, initialDays = 3 } = input;

    if (!email || !problemLink || !problemTitle) {
      throw new AppError('Missing required fields: email, problemLink, and problemTitle are required.', 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new AppError('Invalid email format.', 400);
    }

    if (!isLeetCodeUrl(problemLink)) {
      throw new AppError('problemLink must be a valid LeetCode problem URL.', 400);
    }

    const canonicalLink = canonicalizeUrl(problemLink);
    const slug = extractSlug(canonicalLink);
    const cleanedTitle = cleanProblemTitle(problemTitle, slug);
    const cleanTopic = normalizeTopic(topic);
    const cleanDifficulty = normalizeDifficulty(difficulty);

    const days = Math.min(Math.max(parseInt(String(initialDays), 10) || 3, 1), 30);
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + days);

    const existing = await this.collection.findOne({ email: cleanEmail, problemLink: canonicalLink });

    if (existing) {
      await this.collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            problemTitle: cleanedTitle,
            topic: cleanTopic,
            difficulty: cleanDifficulty,
            nextReviewAt,
            status: 'active',
            'emailDelivery.status': 'pending',
            updatedAt: new Date(),
          },
        }
      );

      return {
        isNew: false,
        reminderId: existing._id.toString(),
        nextReviewAt,
        message: `🔄 Updated! Next review scheduled for ${nextReviewAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      };
    }

    const newDoc: ReminderDocument = {
      _id: new ObjectId(),
      email: cleanEmail,
      problemLink: canonicalLink,
      problemSlug: slug,
      problemTitle: cleanedTitle,
      topic: cleanTopic,
      difficulty: cleanDifficulty,
      status: 'active',
      reviewCount: 0,
      consecutiveIndependent: 0,
      lastReviewedAt: null,
      lastOutcome: null,
      nextReviewAt,
      history: [],
      emailDelivery: {
        status: 'pending',
        sentAt: null,
        attemptCount: 0,
        lastError: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.collection.insertOne(newDoc as any);

    return {
      isNew: true,
      reminderId: newDoc._id.toString(),
      nextReviewAt,
      message: `✅ Saved to Revision Queue! Next review: ${nextReviewAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    };
  }

  async getUserQueue(email: string) {
    if (!email || !email.includes('@')) {
      throw new AppError('Valid email parameter required.', 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    const reminders = await this.collection.find({ email: cleanEmail }).sort({ nextReviewAt: 1 }).toArray();

    const now = new Date();
    const due: ReminderDocument[] = [];
    const upcoming: ReminderDocument[] = [];
    const mastered: ReminderDocument[] = [];
    const topicStats: Record<string, { total: number; mastered: number; struggling: number }> = {};

    reminders.forEach((item) => {
      const topic = item.topic || 'Other';
      if (!topicStats[topic]) {
        topicStats[topic] = { total: 0, mastered: 0, struggling: 0 };
      }
      topicStats[topic].total += 1;

      if (item.status === 'mastered') {
        topicStats[topic].mastered += 1;
        mastered.push(item);
      } else if (new Date(item.nextReviewAt) <= now) {
        if (item.lastOutcome === 'again' || item.lastOutcome === 'failed') {
          topicStats[topic].struggling += 1;
        }
        due.push(item);
      } else {
        if (item.lastOutcome === 'again' || item.lastOutcome === 'failed') {
          topicStats[topic].struggling += 1;
        }
        upcoming.push(item);
      }
    });

    return {
      due,
      upcoming,
      mastered,
      stats: {
        totalProblems: reminders.length,
        dueCount: due.length,
        masteredCount: mastered.length,
        upcomingCount: upcoming.length,
        topicStats,
      },
    };
  }

  async recordReview(input: RecordReviewInput) {
    const { id, email, problemLink, outcome, baseDate = new Date() } = input;

    let reminder: ReminderDocument | null = null;
    if (id && ObjectId.isValid(id)) {
      reminder = await this.collection.findOne({ _id: new ObjectId(id) });
    } else if (email && problemLink) {
      reminder = await this.collection.findOne({
        email: email.trim().toLowerCase(),
        problemLink: canonicalizeUrl(problemLink),
      });
    }

    if (!reminder) {
      throw new AppError('Reminder not found in queue.', 404);
    }

    const calculation = calculateReviewInterval({
      outcome: outcome as any,
      currentConsecutiveEasy: reminder.consecutiveIndependent || 0,
      totalReviews: reminder.reviewCount || 0,
      baseDate,
    });

    const targetStatus = determineReminderStatus(
      reminder.status,
      calculation.normalizedOutcome,
      calculation.newConsecutiveEasy
    );

    const historyEntry = {
      outcome: calculation.normalizedOutcome,
      reviewedAt: baseDate,
      nextIntervalDays: calculation.nextIntervalDays,
      policyVersion: calculation.policyVersion,
    };

    await this.collection.updateOne(
      { _id: reminder._id },
      {
        $set: {
          nextReviewAt: calculation.nextReviewAt,
          consecutiveIndependent: calculation.newConsecutiveEasy,
          reviewCount: calculation.newTotalReviews,
          status: targetStatus,
          lastReviewedAt: baseDate,
          lastOutcome: calculation.normalizedOutcome,
          'emailDelivery.status': 'pending',
          updatedAt: new Date(),
        },
        $push: {
          history: historyEntry,
        } as any,
      }
    );

    let message: string;
    if (targetStatus === 'mastered') {
      message = '🏆 Problem Mastered! Solved independently 3 consecutive times.';
    } else if (calculation.normalizedOutcome === 'again') {
      message = 'Scheduled for revision tomorrow to cement the pattern.';
    } else if (calculation.normalizedOutcome === 'with_hints') {
      message = 'Good effort! Scheduled for review in 3 days.';
    } else {
      message = `Great job! Streak: ${calculation.newConsecutiveEasy}. Next review in ${calculation.nextIntervalDays} days.`;
    }

    return {
      message,
      reminderId: reminder._id.toString(),
      problemTitle: reminder.problemTitle,
      problemLink: reminder.problemLink,
      nextReviewAt: calculation.nextReviewAt,
      nextIntervalDays: calculation.nextIntervalDays,
      consecutiveIndependent: calculation.newConsecutiveEasy,
      status: targetStatus,
      isMastered: targetStatus === 'mastered',
    };
  }

  async deleteReminder(id: string): Promise<boolean> {
    if (!id || !ObjectId.isValid(id)) {
      throw new AppError('Invalid ID format.', 400);
    }
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  async getById(id: string): Promise<ReminderDocument | null> {
    if (!id || !ObjectId.isValid(id)) return null;
    return await this.collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Reclaims reminders that were marked 'sending' but whose lease timed out (e.g. worker crashed).
   */
  async reclaimStaleLeases(leaseTimeoutMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - leaseTimeoutMs);
    const result = await this.collection.updateMany(
      {
        'emailDelivery.status': 'sending',
        'emailDelivery.lockedAt': { $lte: cutoff },
      },
      {
        $set: {
          'emailDelivery.status': 'failed',
          'emailDelivery.lastError': 'Worker claim lease expired without completion confirmation',
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount;
  }

  /**
   * Discovers and atomically leases the next due reminder for worker dispatch.
   * Excludes reminders already attempted in the active sweep to prevent immediate hot retries.
   */
  async claimNextDueReminder(excludeIds: ObjectId[] = [], now = new Date()): Promise<ReminderDocument | null> {
    const query: any = {
      status: 'active',
      nextReviewAt: { $lte: now },
      'emailDelivery.status': { $in: ['pending', 'failed'] },
      'emailDelivery.attemptCount': { $lt: 5 }, // Retry limit before dead-lettering
    };

    if (excludeIds.length > 0) {
      query._id = { $nin: excludeIds };
    }

    const result = await this.collection.findOneAndUpdate(
      query,
      {
        $set: {
          'emailDelivery.status': 'sending',
          'emailDelivery.lockedAt': now,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );
    return (result as any) || null;
  }

  async markDeliverySuccess(id: ObjectId, providerMessageId: string): Promise<void> {
    await this.collection.updateOne(
      { _id: id },
      {
        $set: {
          'emailDelivery.status': 'sent',
          'emailDelivery.sentAt': new Date(),
          'emailDelivery.lastError': null,
          'emailDelivery.providerMessageId': providerMessageId,
          updatedAt: new Date(),
        },
      }
    );
  }

  async markDeliveryFailure(id: ObjectId, errorMessage: string): Promise<void> {
    await this.collection.updateOne(
      { _id: id },
      {
        $set: {
          'emailDelivery.status': 'failed',
          'emailDelivery.lastError': errorMessage,
          updatedAt: new Date(),
        },
        $inc: {
          'emailDelivery.attemptCount': 1,
        },
      }
    );
  }
}
