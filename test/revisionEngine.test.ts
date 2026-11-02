// test/revisionEngine.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReviewInterval, normalizeOutcome, DEFAULT_REVISION_POLICY } from '../src/revision-engine/index.ts';

test('Revision Engine: normalizeOutcome handles canonical and legacy outcomes', () => {
  assert.strictEqual(normalizeOutcome('again'), 'again');
  assert.strictEqual(normalizeOutcome('failed'), 'again');
  assert.strictEqual(normalizeOutcome('with_hints'), 'with_hints');
  assert.strictEqual(normalizeOutcome('hints'), 'with_hints');
  assert.strictEqual(normalizeOutcome('easy'), 'easy');
  assert.strictEqual(normalizeOutcome('independent'), 'easy');

  assert.throws(() => normalizeOutcome('invalid_outcome' as any), /Invalid review outcome/);
});

test('Revision Engine: "again" outcome sets interval to 1 day and resets streak', () => {
  const base = new Date('2026-11-01T12:00:00Z');
  const result = calculateReviewInterval({
    outcome: 'again',
    currentConsecutiveEasy: 2,
    totalReviews: 5,
    baseDate: base,
  });

  assert.strictEqual(result.nextIntervalDays, 1);
  assert.strictEqual(result.newConsecutiveEasy, 0);
  assert.strictEqual(result.newTotalReviews, 6);
  assert.strictEqual(result.isMastered, false);
  assert.strictEqual(result.nextReviewAt.toISOString(), '2026-11-02T12:00:00.000Z');
});

test('Revision Engine: "with_hints" outcome sets interval to 3 days and resets streak', () => {
  const base = new Date('2026-11-01T12:00:00Z');
  const result = calculateReviewInterval({
    outcome: 'with_hints',
    currentConsecutiveEasy: 2,
    totalReviews: 3,
    baseDate: base,
  });

  assert.strictEqual(result.nextIntervalDays, 3);
  assert.strictEqual(result.newConsecutiveEasy, 0);
  assert.strictEqual(result.newTotalReviews, 4);
  assert.strictEqual(result.isMastered, false);
  assert.strictEqual(result.nextReviewAt.toISOString(), '2026-11-04T12:00:00.000Z');
});

test('Revision Engine: consecutive "easy" reviews step through 7d -> 14d -> 30d (Mastered)', () => {
  const base = new Date('2026-11-01T00:00:00Z');

  // First easy solve
  const first = calculateReviewInterval({
    outcome: 'easy',
    currentConsecutiveEasy: 0,
    totalReviews: 0,
    baseDate: base,
  });
  assert.strictEqual(first.nextIntervalDays, 7);
  assert.strictEqual(first.newConsecutiveEasy, 1);
  assert.strictEqual(first.isMastered, false);

  // Second easy solve
  const second = calculateReviewInterval({
    outcome: 'easy',
    currentConsecutiveEasy: 1,
    totalReviews: 1,
    baseDate: first.nextReviewAt,
  });
  assert.strictEqual(second.nextIntervalDays, 14);
  assert.strictEqual(second.newConsecutiveEasy, 2);
  assert.strictEqual(second.isMastered, false);

  // Third easy solve -> Mastered
  const third = calculateReviewInterval({
    outcome: 'easy',
    currentConsecutiveEasy: 2,
    totalReviews: 2,
    baseDate: second.nextReviewAt,
  });
  assert.strictEqual(third.nextIntervalDays, 30);
  assert.strictEqual(third.newConsecutiveEasy, 3);
  assert.strictEqual(third.isMastered, true);
});

test('Revision Engine: throws error on invalid baseDate', () => {
  assert.throws(() => {
    calculateReviewInterval({
      outcome: 'easy',
      baseDate: new Date('invalid-date'),
    });
  }, /Invalid baseDate/);
});

test('Revision Engine: supports custom configurable policy', () => {
  const base = new Date('2026-11-01T00:00:00Z');
  const result = calculateReviewInterval({
    outcome: 'again',
    baseDate: base,
    policy: { againIntervalDays: 2 },
  });
  assert.strictEqual(result.nextIntervalDays, 2);
});
