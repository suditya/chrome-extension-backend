// test/backfill.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { runBackfill } from '../src/migrations/backfill.ts';
import { COLLECTIONS } from '../src/modules/data/indexes.ts';

// In-Memory mock DB driver for backfill testing
class MockBackfillDb {
  public collections: Record<string, any[]> = {
    [COLLECTIONS.LEGACY_SCHEDULED_EMAILS]: [],
    [COLLECTIONS.PROBLEMS]: [],
    [COLLECTIONS.REMINDERS]: [],
    [COLLECTIONS.REVIEW_ATTEMPTS]: [],
    [COLLECTIONS.NOTIFICATION_DELIVERIES]: [],
  };

  collection(name: string) {
    if (!this.collections[name]) {
      this.collections[name] = [];
    }
    const store = this.collections[name];

    return {
      createIndex: async () => {},
      find: (filter: any = {}) => ({
        toArray: async () => store.filter((item) => matchFilter(item, filter)),
      }),
      findOne: async (filter: any) => store.find((item) => matchFilter(item, filter)) || null,
      insertOne: async (doc: any) => {
        store.push(doc);
        return { insertedId: doc._id };
      },
      findOneAndUpdate: async (filter: any, update: any, options: any) => {
        let doc = store.find((item) => matchFilter(item, filter));
        if (!doc && options?.upsert) {
          doc = { ...options?.$setOnInsert, ...update?.$setOnInsert };
          store.push(doc);
        }
        if (doc && update?.$set) {
          Object.assign(doc, update.$set);
        }
        return doc;
      },
    };
  }
}

function matchFilter(item: any, filter: any): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$')) continue;
    if (item[k] instanceof ObjectId && v instanceof ObjectId) {
      if (!item[k].equals(v)) return false;
    } else if (item[k] instanceof Date && v instanceof Date) {
      if (item[k].getTime() !== v.getTime()) return false;
    } else if (item[k] !== v) {
      return false;
    }
  }
  return true;
}

test('Backfill Migration: idempotently backfills legacy records into normalized collections', async () => {
  const mockDb = new MockBackfillDb();
  const legacyColl = mockDb.collection(COLLECTIONS.LEGACY_SCHEDULED_EMAILS);

  const legacyReminder = {
    _id: new ObjectId(),
    email: 'testuser@example.com',
    problemLink: 'https://leetcode.com/problems/two-sum/description/',
    problemTitle: 'Two Sum',
    difficulty: 'Easy',
    topic: 'Arrays & Hashing',
    status: 'active',
    reviewCount: 1,
    consecutiveIndependent: 1,
    lastReviewedAt: new Date('2026-11-01T10:00:00Z'),
    lastOutcome: 'independent',
    nextReviewAt: new Date('2026-11-08T10:00:00Z'),
    history: [
      { outcome: 'independent', reviewedAt: new Date('2026-11-01T10:00:00Z'), nextIntervalDays: 7 },
    ],
    emailDelivery: {
      status: 'sent',
      sentAt: new Date('2026-11-01T10:01:00Z'),
      attemptCount: 1,
      lastError: null,
      providerMessageId: 'msg-12345',
    },
    createdAt: new Date('2026-10-25T10:00:00Z'),
  };

  await legacyColl.insertOne(legacyReminder);

  // 1st Run
  const stats1 = await runBackfill(mockDb as any);
  assert.strictEqual(stats1.legacyProcessed, 1);
  assert.strictEqual(stats1.problemsUpserted, 1);
  assert.strictEqual(stats1.remindersUpserted, 1);
  assert.strictEqual(stats1.reviewsCreated, 1);
  assert.strictEqual(stats1.notificationsCreated, 1);

  // Verify normalized documents
  const problems = await mockDb.collection(COLLECTIONS.PROBLEMS).find({}).toArray();
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].canonicalUrl, 'https://leetcode.com/problems/two-sum/');
  assert.strictEqual(problems[0].slug, 'two-sum');

  const reminders = await mockDb.collection(COLLECTIONS.REMINDERS).find({}).toArray();
  assert.strictEqual(reminders.length, 1);
  assert.strictEqual(reminders[0].userId, 'testuser@example.com');
  assert.strictEqual(reminders[0].status, 'active');

  const deliveries = await mockDb.collection(COLLECTIONS.NOTIFICATION_DELIVERIES).find({}).toArray();
  assert.strictEqual(deliveries.length, 1);
  assert.strictEqual(deliveries[0].status, 'sent');
  assert.ok(deliveries[0].notificationId.includes(reminders[0]._id.toString()));

  // 2nd Run (Idempotency verification - should NOT duplicate!)
  const stats2 = await runBackfill(mockDb as any);
  assert.strictEqual(stats2.reviewsCreated, 0);
  assert.strictEqual(stats2.notificationsCreated, 0);

  const reviewsTotal = await mockDb.collection(COLLECTIONS.REVIEW_ATTEMPTS).find({}).toArray();
  assert.strictEqual(reviewsTotal.length, 1); // No duplicates
});
