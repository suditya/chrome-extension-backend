// src/revision-engine/policy.ts
import type { RevisionPolicy } from './types.ts';

export const DEFAULT_REVISION_POLICY: RevisionPolicy = {
  version: '1.0.0',
  againIntervalDays: 1,
  hintsIntervalDays: 3,
  easyInitialIntervalDays: 7,
  easyConsecutiveIntervalDays: 14,
  easyMasteredIntervalDays: 30,
  masteryConsecutiveThreshold: 3,
};
