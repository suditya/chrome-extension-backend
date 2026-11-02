// src/migrations/backfill.ts
import { ObjectId, type Db } from 'mongodb';
import { COLLECTIONS, ensureNormalizedIndexes } from '../modules/data/indexes.ts';
import type {
  ProblemDoc,
  ReminderDoc,
  ReviewAttemptDoc,
  NotificationDeliveryDoc,
} from '../modules/data/schemas.ts';
import { canonicalizeUrl, extractSlug, cleanProblemTitle, normalizeDifficulty, normalizeTopic } from '../modules/problems/url.ts';
import { normalizeOutcome } from '../revision-engine/index.ts';

export interface BackfillStats {
  legacyProcessed: number;
  problemsUpserted: number;
  remindersUpserted: number;
  reviewsCreated: number;
  notificationsCreated: number;
}

/**
 * Idempotently migrates all existing records from legacy `scheduledEmails` into
 * normalized collections: `problems`, `reminders`, `review_attempts`, and `notification_deliveries`.
 *
 * Safe to re-run multiple times. Never modifies or deletes records from `scheduledEmails`.
 */
export async function runBackfill(db: Db): Promise<BackfillStats> {
  await ensureNormalizedIndexes(db);

  const legacyColl = db.collection(COLLECTIONS.LEGACY_SCHEDULED_EMAILS);
  const problemsColl = db.collection<ProblemDoc>(COLLECTIONS.PROBLEMS);
  const remindersColl = db.collection<ReminderDoc>(COLLECTIONS.REMINDERS);
  const reviewsColl = db.collection<ReviewAttemptDoc>(COLLECTIONS.REVIEW_ATTEMPTS);
  const deliveriesColl = db.collection<NotificationDeliveryDoc>(COLLECTIONS.NOTIFICATION_DELIVERIES);

  const legacyDocs = await legacyColl.find({}).toArray();

  const stats: BackfillStats = {
    legacyProcessed: legacyDocs.length,
    problemsUpserted: 0,
    remindersUpserted: 0,
    reviewsCreated: 0,
    notificationsCreated: 0,
  };

  for (const doc of legacyDocs) {
    const rawLink = doc.problemLink || '';
    if (!rawLink) continue;

    const canonicalUrl = canonicalizeUrl(rawLink);
    const slug = doc.problemSlug || extractSlug(canonicalUrl);
    const title = cleanProblemTitle(doc.problemTitle || doc.problemName || slug, slug);
    const difficulty = normalizeDifficulty(doc.difficulty);
    const topic = normalizeTopic(doc.topic);
    const userEmail = (doc.email || '').trim().toLowerCase();
    const now = new Date();

    if (!userEmail) continue;

    // 1. Upsert Problem
    const problemResult = await problemsColl.findOneAndUpdate(
      { canonicalUrl },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          slug,
          canonicalUrl,
          title,
          difficulty,
          topics: [topic],
          source: 'leetcode',
          createdAt: doc.createdAt || now,
        },
        $set: {
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const problem = (problemResult as any) || (await problemsColl.findOne({ canonicalUrl }));
    if (!problem) continue;
    stats.problemsUpserted++;

    // 2. Upsert Reminder
    const nextReviewAt = doc.nextReviewAt ? new Date(doc.nextReviewAt) : doc.scheduledDay ? new Date(doc.scheduledDay) : now;
    const status = doc.status === 'mastered' ? 'mastered' : 'active';
    const consecutiveIndependent = doc.consecutiveIndependent || 0;
    const reviewCount = doc.reviewCount || 0;

    let lastOutcome = null;
    try {
      if (doc.lastOutcome) lastOutcome = normalizeOutcome(doc.lastOutcome);
    } catch (_e) {
      lastOutcome = null;
    }

    const reminderResult = await remindersColl.findOneAndUpdate(
      { userId: userEmail, problemId: problem._id },
      {
        $setOnInsert: {
          _id: doc._id instanceof ObjectId ? doc._id : new ObjectId(),
          userId: userEmail,
          problemId: problem._id,
          createdAt: doc.createdAt || now,
        },
        $set: {
          status,
          nextReviewAt,
          timezone: 'UTC',
          consecutiveIndependent,
          totalReviews: reviewCount,
          lastOutcome,
          lastReviewedAt: doc.lastReviewedAt ? new Date(doc.lastReviewedAt) : null,
          notificationPreferences: {
            channel: 'email',
            enabled: true,
          },
          cancelledAt: null,
          completedAt: status === 'mastered' ? (doc.lastReviewedAt ? new Date(doc.lastReviewedAt) : now) : null,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const reminder = (reminderResult as any) || (await remindersColl.findOne({ userId: userEmail, problemId: problem._id }));
    if (!reminder) continue;
    stats.remindersUpserted++;

    // 3. Backfill Review Attempts (if history exists)
    if (Array.isArray(doc.history)) {
      for (const h of doc.history) {
        if (!h.reviewedAt) continue;
        const reviewedDate = new Date(h.reviewedAt);
        let outcome = 'easy' as const;
        try {
          outcome = normalizeOutcome(h.outcome);
        } catch (_e) {
          outcome = 'easy';
        }

        const existingReview = await reviewsColl.findOne({
          reminderId: reminder._id,
          attemptedAt: reviewedDate,
        });

        if (!existingReview) {
          await reviewsColl.insertOne({
            _id: new ObjectId(),
            userId: userEmail,
            problemId: problem._id,
            reminderId: reminder._id,
            attemptedAt: reviewedDate,
            outcome,
            notes: null,
            previousScheduledAt: reviewedDate,
            nextScheduledAt: new Date(reviewedDate.getTime() + (h.nextIntervalDays || 1) * 24 * 60 * 60 * 1000),
            previousIntervalDays: 0,
            nextIntervalDays: h.nextIntervalDays || 1,
            policyVersion: h.policyVersion || '1.0.0',
            createdAt: reviewedDate,
          });
          stats.reviewsCreated++;
        }
      }
    }

    // 4. Backfill Notification Delivery (if emailDelivery state exists)
    if (doc.emailDelivery) {
      const scheduledFor = nextReviewAt;
      const notificationId = `${reminder._id.toString()}_${scheduledFor.getTime()}`;

      const existingDelivery = await deliveriesColl.findOne({ notificationId });
      if (!existingDelivery) {
        await deliveriesColl.insertOne({
          _id: new ObjectId(),
          notificationId,
          reminderId: reminder._id,
          userId: userEmail,
          scheduledFor,
          channel: 'email',
          status: doc.emailDelivery.status === 'sent' ? 'sent' : doc.emailDelivery.status === 'failed' ? 'failed' : 'pending',
          attemptCount: doc.emailDelivery.attemptCount || (doc.emailDelivery.status === 'sent' ? 1 : 0),
          sentAt: doc.emailDelivery.sentAt ? new Date(doc.emailDelivery.sentAt) : null,
          lastError: doc.emailDelivery.lastError || null,
          providerMessageId: doc.emailDelivery.providerMessageId || null,
          createdAt: doc.emailDelivery.sentAt ? new Date(doc.emailDelivery.sentAt) : now,
          updatedAt: now,
        });
        stats.notificationsCreated++;
      }
    }
  }

  return stats;
}

