// test/jobQueue.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationQueue, generateJobId } from '../src/worker/queue/jobQueue.ts';
import { MockEmailTransport } from '../src/modules/notifications/transport.ts';
import type { NotificationJobData } from '../src/worker/queue/types.ts';

test('Job Queue: deterministic deduplication prevents duplicate enqueuing', async () => {
  const queue = new NotificationQueue();
  const scheduledDate = new Date('2026-11-05T12:00:00Z');
  const jobId = generateJobId('rem-123', scheduledDate);

  const jobPayload: NotificationJobData = {
    jobId,
    correlationId: 'corr-1',
    reminderId: 'rem-123',
    recipientEmail: 'user@example.com',
    problemTitle: 'Two Sum',
    problemLink: 'https://leetcode.com/problems/two-sum/',
    topic: 'Arrays & Hashing',
    difficulty: 'Easy',
    consecutiveIndependent: 1,
    scheduledFor: scheduledDate.toISOString(),
    publicUrlBase: 'http://localhost:3000',
    adminEmail: 'admin@example.com',
    attemptCount: 0,
  };

  // First enqueue succeeds
  const first = await queue.enqueue(jobPayload);
  assert.strictEqual(first, true);
  assert.strictEqual(queue.size(), 1);

  // Second enqueue of identical job is deduplicated
  const second = await queue.enqueue(jobPayload);
  assert.strictEqual(second, false);
  assert.strictEqual(queue.size(), 1);
});

test('Job Queue: processes job successfully via transport and triggers onSuccess callback', async () => {
  const queue = new NotificationQueue();
  const transport = new MockEmailTransport();

  const job: NotificationJobData = {
    jobId: generateJobId('rem-456', new Date()),
    correlationId: 'corr-2',
    reminderId: 'rem-456',
    recipientEmail: 'student@example.com',
    problemTitle: '3Sum',
    problemLink: 'https://leetcode.com/problems/3sum/',
    topic: 'Two Pointers',
    difficulty: 'Medium',
    consecutiveIndependent: 0,
    scheduledFor: new Date().toISOString(),
    publicUrlBase: 'http://localhost:3000',
    adminEmail: 'admin@example.com',
    attemptCount: 0,
  };

  await queue.enqueue(job);

  let successCalled = false;
  let recordedMessageId = '';

  const result = await queue.processNextJob(
    transport,
    async (_j, res) => {
      successCalled = true;
      recordedMessageId = res.messageId || '';
    },
    async () => {}
  );

  assert.strictEqual(result?.success, true);
  assert.strictEqual(successCalled, true);
  assert.ok(recordedMessageId.startsWith('mock-msg-'));
  assert.strictEqual(transport.sentMessages.length, 1);
  assert.strictEqual(transport.sentMessages[0].to, 'student@example.com');
});

test('Job Queue: handles transport failure and tracks retry attempts', async () => {
  const queue = new NotificationQueue({ maxRetries: 3, initialBackoffMs: 10 });
  const transport = new MockEmailTransport();
  transport.shouldFail = true;
  transport.failureMessage = 'Connection dropped by peer';

  const job: NotificationJobData = {
    jobId: generateJobId('rem-789', new Date()),
    correlationId: 'corr-3',
    reminderId: 'rem-789',
    recipientEmail: 'fail@example.com',
    problemTitle: 'LRU Cache',
    problemLink: 'https://leetcode.com/problems/lru-cache/',
    topic: 'Linked List',
    difficulty: 'Medium',
    consecutiveIndependent: 0,
    scheduledFor: new Date().toISOString(),
    publicUrlBase: 'http://localhost:3000',
    adminEmail: 'admin@example.com',
    attemptCount: 0,
  };

  await queue.enqueue(job);

  let failureCalled = false;
  let receivedError = '';
  let willRetryFlag = false;

  const result = await queue.processNextJob(
    transport,
    async () => {},
    async (_j, err, willRetry) => {
      failureCalled = true;
      receivedError = err;
      willRetryFlag = willRetry;
    }
  );

  assert.strictEqual(result?.success, false);
  assert.strictEqual(failureCalled, true);
  assert.strictEqual(receivedError, 'Connection dropped by peer');
  assert.strictEqual(willRetryFlag, true);
  assert.strictEqual(result?.attemptCount, 1);
});

