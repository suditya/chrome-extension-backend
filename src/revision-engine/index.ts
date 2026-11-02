// src/revision-engine/index.ts
import { DEFAULT_REVISION_POLICY } from './policy.ts';
import type {
  ReviewCalculationInput,
  ReviewCalculationResult,
  ReviewOutcome,
  RevisionPolicy,
  SupportedOutcome,
} from './types.ts';

export type * from './types.ts';
export * from './policy.ts';

/**
 * Normalizes input outcome strings (including legacy aliases) to canonical ReviewOutcome.
 */
export function normalizeOutcome(raw: SupportedOutcome): ReviewOutcome {
  const sanitized = String(raw).trim().toLowerCase();
  switch (sanitized) {
    case 'again':
    case 'failed':
      return 'again';
    case 'with_hints':
    case 'hints':
      return 'with_hints';
    case 'easy':
    case 'independent':
      return 'easy';
    default:
      throw new Error(`Invalid review outcome: "${raw}". Supported values: again, with_hints, easy.`);
  }
}

/**
 * Pure calculation function for Spaced Repetition interval updates.
 *
 * Implements the performance-based scheduling algorithm:
 * - 'again'      -> 1 day interval; resets consecutive easy streak to 0.
 * - 'with_hints' -> 3 day interval; resets consecutive easy streak to 0.
 * - 'easy'       -> 7 days (1st consecutive), 14 days (2nd consecutive), 30 days (3rd+ consecutive, marks as mastered).
 *
 * Timezone Policy:
 * Dates are calculated on UTC timestamps by adding whole-day offsets (86,400,000 ms),
 * ensuring consistency across leap days, daylight savings transitions, and multi-region servers.
 */
export function calculateReviewInterval(input: ReviewCalculationInput): ReviewCalculationResult {
  const {
    outcome,
    currentConsecutiveEasy = 0,
    totalReviews = 0,
    baseDate = new Date(),
    policy: customPolicy = {},
  } = input;

  if (isNaN(baseDate.getTime())) {
    throw new Error('Invalid baseDate provided for review interval calculation.');
  }

  const policy: RevisionPolicy = {
    ...DEFAULT_REVISION_POLICY,
    ...customPolicy,
  };

  const normalizedOutcome = normalizeOutcome(outcome);

  let nextIntervalDays: number;
  let newConsecutiveEasy = 0;

  switch (normalizedOutcome) {
    case 'again':
      nextIntervalDays = policy.againIntervalDays;
      newConsecutiveEasy = 0;
      break;

    case 'with_hints':
      nextIntervalDays = policy.hintsIntervalDays;
      newConsecutiveEasy = 0;
      break;

    case 'easy':
      newConsecutiveEasy = Math.max(0, currentConsecutiveEasy) + 1;
      if (newConsecutiveEasy === 1) {
        nextIntervalDays = policy.easyInitialIntervalDays;
      } else if (newConsecutiveEasy === 2) {
        nextIntervalDays = policy.easyConsecutiveIntervalDays;
      } else {
        nextIntervalDays = policy.easyMasteredIntervalDays;
      }
      break;
  }

  const isMastered = newConsecutiveEasy >= policy.masteryConsecutiveThreshold;

  // Add whole day milliseconds to ensure immutable UTC date math
  const nextReviewAt = new Date(baseDate.getTime() + nextIntervalDays * 24 * 60 * 60 * 1000);

  return {
    policyVersion: policy.version,
    normalizedOutcome,
    nextIntervalDays,
    nextReviewAt,
    newConsecutiveEasy,
    newTotalReviews: Math.max(0, totalReviews) + 1,
    isMastered,
  };
}
