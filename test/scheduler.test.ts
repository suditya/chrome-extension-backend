// test/scheduler.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { NotificationScheduler } from '../src/worker/scheduler.ts';
import { MockEmailTransport } from '../src/modules/notifications/transport.ts';
import type { ReminderDocument } from '../src/modules/reminders/types.ts';
import type { AppConfig } from '../src/config/index.ts';

// In-Memory Mock of ReminderService for deterministic testing
class MockReminderService {
  public reminders: ReminderDocument[] = [];

  async reclaimStaleLeases(timeoutMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMs);
    let count = 0;
    for (const r of this.reminders) {
      if (r.emailDelivery.status === 'sending' && r.emailDelivery.lockedAt && r.emailDelivery.lockedAt <= cutoff) {
        r.emailDelivery.status = 'failed';
        r.emailDelivery.lastError = 'Worker claim lease expired without completion confirmation';
        count++;
      }
    }
    return count;
  }

  async claimNextDueReminder(excludeIds: ObjectId[] = [], now = new Date()): Promise<ReminderDocument | null> {
    for (const r of this.reminders) {
      if (excludeIds.some((id) => id.equals(r._id))) continue;
      if (
        r.status === 'active' &&
        r.nextReviewAt <= now &&
        (r.emailDelivery.status === 'pending' || r.emailDelivery.status === 'failed')
      ) {
        r.emailDelivery.status = 'sending';
        r.emailDelivery.lockedAt = now;
        return r;
      }
    }
    return null;
  }

  async markDeliverySuccess(id: ObjectId, providerMessageId: string): Promise<void> {
    const r = this.reminders.find((item) => item._id.equals(id));
    if (r) {
      r.emailDelivery.status = 'sent';
      r.emailDelivery.sentAt = new Date();
      r.emailDelivery.providerMessageId = providerMessageId;
    }
  }

  async markDeliveryFailure(id: ObjectId, errorMessage: string): Promise<void> {
    const r = this.reminders.find((item) => item._id.equals(id));
    if (r) {
      r.emailDelivery.status = 'failed';
      r.emailDelivery.lastError = errorMessage;
      r.emailDelivery.attemptCount = (r.emailDelivery.attemptCount || 0) + 1;
    }
  }
}

const testConfig: AppConfig = {
  port: 3000,
  nodeEnv: 'test',
  mongoUri: 'mongodb://127.0.0.1:27017',
  dbName: 'test',
  adminEmail: 'test@example.com',
  adminPass: 'pass',
  corsOrigin: '*',
  backendPublicUrl: 'http://localhost:3000',
  workerIntervalMs: 1000,
  leaseTimeoutMs: 5000,
};

test('Scheduler: successfully processes due reminders and records messageId', async () => {
  const service = new MockReminderService();
  const transport = new MockEmailTransport();

  const reminder: ReminderDocument = {
    _id: new ObjectId(),
    email: 'learner@example.com',
    problemLink: 'https://leetcode.com/problems/two-sum/',
    problemSlug: 'two-sum',
    problemTitle: 'Two Sum',
    topic: 'Arrays & Hashing',
    difficulty: 'Easy',
    status: 'active',
    reviewCount: 0,
    consecutiveIndependent: 0,
    lastReviewedAt: null,
    lastOutcome: null,
    nextReviewAt: new Date(Date.now() - 10000), // Due in the past
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

  service.reminders.push(reminder);

  const scheduler = new NotificationScheduler(service as any, transport, testConfig);
  const result = await scheduler.processDueReminders();

  assert.strictEqual(result.delivered, 1);
  assert.strictEqual(result.failed, 0);
  assert.strictEqual(reminder.emailDelivery.status, 'sent');
  assert.strictEqual(transport.sentMessages.length, 1);
  assert.strictEqual(transport.sentMessages[0].to, 'learner@example.com');
  assert.match(transport.sentMessages[0].subject, /Two Sum/);
});

test('Scheduler: handles transport failure, increments attemptCount, records error', async () => {
  const service = new MockReminderService();
  const transport = new MockEmailTransport();
  transport.shouldFail = true;
  transport.failureMessage = 'SMTP 421 Service unavailable';

  const reminder: ReminderDocument = {
    _id: new ObjectId(),
    email: 'fail@example.com',
    problemLink: 'https://leetcode.com/problems/lru-cache/',
    problemSlug: 'lru-cache',
    problemTitle: 'LRU Cache',
    topic: 'Linked List',
    difficulty: 'Medium',
    status: 'active',
    reviewCount: 1,
    consecutiveIndependent: 1,
    lastReviewedAt: null,
    lastOutcome: null,
    nextReviewAt: new Date(Date.now() - 5000),
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

  service.reminders.push(reminder);

  const scheduler = new NotificationScheduler(service as any, transport, testConfig);
  const result = await scheduler.processDueReminders();

  assert.strictEqual(result.delivered, 0);
  assert.strictEqual(result.failed, 1);
  assert.strictEqual(reminder.emailDelivery.status, 'failed');
  assert.strictEqual(reminder.emailDelivery.attemptCount, 1);
  assert.strictEqual(reminder.emailDelivery.lastError, 'SMTP 421 Service unavailable');
});

test('Scheduler: reclaims crashed worker leases when lease timeout expires', async () => {
  const service = new MockReminderService();
  const transport = new MockEmailTransport();

  const crashedReminder: ReminderDocument = {
    _id: new ObjectId(),
    email: 'crashed@example.com',
    problemLink: 'https://leetcode.com/problems/merge-intervals/',
    problemSlug: 'merge-intervals',
    problemTitle: 'Merge Intervals',
    topic: 'Intervals',
    difficulty: 'Medium',
    status: 'active',
    reviewCount: 0,
    consecutiveIndependent: 0,
    lastReviewedAt: null,
    lastOutcome: null,
    nextReviewAt: new Date(Date.now() - 20000),
    history: [],
    emailDelivery: {
      status: 'sending', // Stuck in sending from dead worker
      sentAt: null,
      attemptCount: 0,
      lastError: null,
      lockedAt: new Date(Date.now() - 10000), // Locked 10s ago (> 5s leaseTimeoutMs)
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  service.reminders.push(crashedReminder);

  const scheduler = new NotificationScheduler(service as any, transport, testConfig);

  // During sweep, stale lease is reclaimed (reset to failed) and then immediately retried & sent!
  const result = await scheduler.processDueReminders();

  assert.strictEqual(result.reclaimed, 1);
  assert.strictEqual(result.delivered, 1);
  assert.strictEqual(crashedReminder.emailDelivery.status, 'sent');
});
