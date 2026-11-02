// src/modules/reminders/stateMachine.ts
import type { ReminderStatus, DeliveryStatus, EmailDeliveryState } from './types.ts';
import type { ReviewOutcome } from '../../revision-engine/types.ts';

const VALID_STATUS_TRANSITIONS: Record<ReminderStatus, ReminderStatus[]> = {
  active: ['active', 'mastered', 'cancelled'],
  mastered: ['active', 'mastered', 'cancelled'],
  cancelled: ['active'], // Re-activating a cancelled reminder
};

/**
 * Validates if a lifecycle state transition is permissible.
 */
export function canTransitionReminderStatus(from: ReminderStatus, to: ReminderStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Computes the target reminder status based on performance outcome.
 */
export function determineReminderStatus(
  current: ReminderStatus,
  outcome: ReviewOutcome,
  consecutiveEasy: number,
  masteryThreshold = 3
): ReminderStatus {
  if (current === 'cancelled') {
    throw new Error('Cannot compute outcome status on a cancelled reminder.');
  }

  // Regression check: failing a mastered problem reactivates it into the active queue
  if (outcome === 'again') {
    return 'active';
  }

  if (outcome === 'easy' && consecutiveEasy >= masteryThreshold) {
    return 'mastered';
  }

  return 'active';
}

/**
 * Checks whether an in-flight delivery claim/lease has expired due to worker crash or hang.
 */
export function isDeliveryLeaseExpired(
  lockedAt: Date | null | undefined,
  leaseTimeoutMs: number,
  now = new Date()
): boolean {
  if (!lockedAt) return false;
  const lockTime = new Date(lockedAt).getTime();
  if (isNaN(lockTime)) return false;
  return now.getTime() - lockTime > leaseTimeoutMs;
}

/**
 * Determines whether a reminder document is eligible for worker claim.
 */
export function isEligibleForDeliveryClaim(
  deliveryState: EmailDeliveryState,
  leaseTimeoutMs: number,
  now = new Date()
): boolean {
  if (deliveryState.status === 'sent') return false;
  if (deliveryState.status === 'pending' || deliveryState.status === 'failed') return true;

  if (deliveryState.status === 'sending') {
    // If sending but lease is expired, allow recovery claim
    return isDeliveryLeaseExpired(deliveryState.lockedAt, leaseTimeoutMs, now);
  }

  return false;
}

