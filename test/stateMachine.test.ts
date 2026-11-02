// test/stateMachine.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionReminderStatus,
  determineReminderStatus,
  isDeliveryLeaseExpired,
  isEligibleForDeliveryClaim,
} from '../src/modules/reminders/stateMachine.ts';

test('State Machine: validates lifecycle transitions', () => {
  assert.strictEqual(canTransitionReminderStatus('active', 'mastered'), true);
  assert.strictEqual(canTransitionReminderStatus('active', 'cancelled'), true);
  assert.strictEqual(canTransitionReminderStatus('mastered', 'active'), true); // regression
  assert.strictEqual(canTransitionReminderStatus('cancelled', 'active'), true); // reactivation
  assert.strictEqual(canTransitionReminderStatus('cancelled', 'mastered'), false);
});

test('State Machine: handles mastery and regression transitions', () => {
  assert.strictEqual(determineReminderStatus('active', 'easy', 3, 3), 'mastered');
  assert.strictEqual(determineReminderStatus('active', 'easy', 2, 3), 'active');
  assert.strictEqual(determineReminderStatus('active', 'with_hints', 5, 3), 'active');

  // Regression: Mastered problem failed drops back to active
  assert.strictEqual(determineReminderStatus('mastered', 'again', 0, 3), 'active');
});

test('State Machine: lease timeout expiration check', () => {
  const now = new Date('2026-11-01T12:10:00Z');
  const freshLock = new Date('2026-11-01T12:08:00Z'); // 2 min ago
  const staleLock = new Date('2026-11-01T12:02:00Z'); // 8 min ago
  const timeoutMs = 5 * 60 * 1000; // 5 min timeout

  assert.strictEqual(isDeliveryLeaseExpired(freshLock, timeoutMs, now), false);
  assert.strictEqual(isDeliveryLeaseExpired(staleLock, timeoutMs, now), true);
  assert.strictEqual(isDeliveryLeaseExpired(null, timeoutMs, now), false);
});

test('State Machine: eligibility for delivery claim', () => {
  const timeoutMs = 5 * 60 * 1000;
  const now = new Date('2026-11-01T12:10:00Z');

  // Sent reminders are not eligible
  assert.strictEqual(
    isEligibleForDeliveryClaim({ status: 'sent', sentAt: now, attemptCount: 1, lastError: null }, timeoutMs, now),
    false
  );

  // Pending and failed reminders are eligible
  assert.strictEqual(
    isEligibleForDeliveryClaim({ status: 'pending', sentAt: null, attemptCount: 0, lastError: null }, timeoutMs, now),
    true
  );
  assert.strictEqual(
    isEligibleForDeliveryClaim({ status: 'failed', sentAt: null, attemptCount: 1, lastError: 'timeout' }, timeoutMs, now),
    true
  );

  // Sending with active lock is NOT eligible (in-flight)
  assert.strictEqual(
    isEligibleForDeliveryClaim(
      { status: 'sending', sentAt: null, attemptCount: 1, lastError: null, lockedAt: new Date('2026-11-01T12:08:00Z') },
      timeoutMs,
      now
    ),
    false
  );

  // Sending with stale lock IS eligible for recovery claim
  assert.strictEqual(
    isEligibleForDeliveryClaim(
      { status: 'sending', sentAt: null, attemptCount: 1, lastError: null, lockedAt: new Date('2026-11-01T12:00:00Z') },
      timeoutMs,
      now
    ),
    true
  );
});

