// src/modules/data/indexes.ts
import type { Db } from 'mongodb';

export const COLLECTIONS = {
  PROBLEMS: 'problems',
  REMINDERS: 'reminders',
  REVIEW_ATTEMPTS: 'review_attempts',
  NOTIFICATION_DELIVERIES: 'notification_deliveries',
  LEGACY_SCHEDULED_EMAILS: 'scheduledEmails',
} as const;

export async function ensureNormalizedIndexes(db: Db): Promise<void> {
  // 1. Problems Collection
  const problemsColl = db.collection(COLLECTIONS.PROBLEMS);
  await problemsColl.createIndex({ canonicalUrl: 1 }, { unique: true });
  await problemsColl.createIndex({ slug: 1 });

  // 2. Reminders Collection
  const remindersColl = db.collection(COLLECTIONS.REMINDERS);
  await remindersColl.createIndex({ status: 1, nextReviewAt: 1 });
  await remindersColl.createIndex({ userId: 1, problemId: 1 }, { unique: true });
  await remindersColl.createIndex({ userId: 1, nextReviewAt: 1 });

  // 3. Review Attempts Collection
  const reviewAttemptsColl = db.collection(COLLECTIONS.REVIEW_ATTEMPTS);
  await reviewAttemptsColl.createIndex({ reminderId: 1, attemptedAt: -1 });
  await reviewAttemptsColl.createIndex({ userId: 1, attemptedAt: -1 });
  await reviewAttemptsColl.createIndex({ problemId: 1 });

  // 4. Notification Deliveries Collection
  const deliveriesColl = db.collection(COLLECTIONS.NOTIFICATION_DELIVERIES);
  await deliveriesColl.createIndex({ notificationId: 1 }, { unique: true });
  await deliveriesColl.createIndex({ status: 1, scheduledFor: 1 });
  await deliveriesColl.createIndex({ reminderId: 1 });
  await deliveriesColl.createIndex({ userId: 1 });
}

