// src/revision-engine/types.ts

export type ReviewOutcome = 'again' | 'with_hints' | 'easy';

export type LegacyOutcomeAlias = 'failed' | 'hints' | 'independent';

export type SupportedOutcome = ReviewOutcome | LegacyOutcomeAlias;

export interface RevisionPolicy {
  version: string;
  againIntervalDays: number;
  hintsIntervalDays: number;
  easyInitialIntervalDays: number;
  easyConsecutiveIntervalDays: number;
  easyMasteredIntervalDays: number;
  masteryConsecutiveThreshold: number;
}

export interface ReviewCalculationInput {
  outcome: SupportedOutcome;
  currentConsecutiveEasy?: number;
  totalReviews?: number;
  baseDate?: Date;
  policy?: Partial<RevisionPolicy>;
}

export interface ReviewCalculationResult {
  policyVersion: string;
  normalizedOutcome: ReviewOutcome;
  nextIntervalDays: number;
  nextReviewAt: Date;
  newConsecutiveEasy: number;
  newTotalReviews: number;
  isMastered: boolean;
}

