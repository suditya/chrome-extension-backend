// srsEngine.js - Spaced Repetition Engine for LeetCode Problems

const TOPICS = [
  "Arrays & Hashing",
  "Two Pointers",
  "Sliding Window",
  "Stack",
  "Binary Search",
  "Linked List",
  "Trees",
  "Tries",
  "Heap / Priority Queue",
  "Backtracking",
  "Graphs",
  "Dynamic Programming",
  "Greedy",
  "Intervals",
  "Math & Geometry",
  "Bit Manipulation",
  "Other",
];

const OUTCOMES = {
  FAILED: "failed", // Couldn't solve
  HINTS: "hints", // Solved with hints / editorial
  INDEPENDENT: "independent", // Solved completely independently
};

/**
 * Calculates the next review date and updated metrics based on performance outcome.
 *
 * Spaced Repetition Intervals:
 * - Couldn't solve: 1 day (streak resets to 0)
 * - Solved with hints: 3 days (streak resets to 0)
 * - Solved independently:
 *     1st consecutive: 7 days
 *     2nd consecutive: 14 days
 *     3rd+ consecutive: 30 days (marked as mastered)
 *
 * @param {Object} params
 * @param {"failed"|"hints"|"independent"} params.outcome
 * @param {number} params.currentConsecutive
 * @param {number} params.totalReviews
 * @returns {Object} { nextIntervalDays, nextReviewAt, newConsecutive, isMastered }
 */
function calculateNextReview({ outcome, currentConsecutive = 0, totalReviews = 0 }) {
  let nextIntervalDays = 1;
  let newConsecutive = 0;

  switch (outcome) {
    case OUTCOMES.FAILED:
      nextIntervalDays = 1;
      newConsecutive = 0;
      break;

    case OUTCOMES.HINTS:
      nextIntervalDays = 3;
      newConsecutive = 0;
      break;

    case OUTCOMES.INDEPENDENT:
      newConsecutive = currentConsecutive + 1;
      if (newConsecutive === 1) {
        nextIntervalDays = 7;
      } else if (newConsecutive === 2) {
        nextIntervalDays = 14;
      } else {
        nextIntervalDays = 30;
      }
      break;

    default:
      nextIntervalDays = 3;
      newConsecutive = 0;
  }

  const isMastered = newConsecutive >= 3;
  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + nextIntervalDays);

  return {
    nextIntervalDays,
    nextReviewAt,
    newConsecutive,
    isMastered,
    newTotalReviews: totalReviews + 1,
  };
}

/**
 * Normalizes topic names to standard categories.
 */
function normalizeTopic(rawTopic) {
  if (!rawTopic) return "Other";
  const trimmed = String(rawTopic).trim();
  const match = TOPICS.find((t) => t.toLowerCase() === trimmed.toLowerCase());
  return match || trimmed;
}

module.exports = {
  TOPICS,
  OUTCOMES,
  calculateNextReview,
  normalizeTopic,
};

