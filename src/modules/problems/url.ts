// src/modules/problems/url.ts
import type { ProblemDifficulty, StandardTopic } from './types.ts';
import { STANDARD_TOPICS } from './types.ts';

const LEETCODE_REGEX = /^https?:\/\/(?:www\.)?leetcode\.(com|cn)\/problems\/([^/?#]+)/i;

/**
 * Checks whether a given string is a valid LeetCode problem URL.
 */
export function isLeetCodeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return LEETCODE_REGEX.test(url.trim());
}

/**
 * Extracts the canonical problem slug from a LeetCode problem URL.
 */
export function extractSlug(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const match = url.trim().match(LEETCODE_REGEX);
  return match ? match[2].toLowerCase() : '';
}

/**
 * Normalizes any LeetCode URL (including solutions/submissions subpaths) into canonical URL.
 */
export function canonicalizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const match = url.trim().match(LEETCODE_REGEX);
  if (!match) return url.trim();

  const domain = match[1].toLowerCase();
  const slug = match[2].toLowerCase();
  return `https://leetcode.${domain}/problems/${slug}/`;
}

/**
 * Formats a kebab-case problem slug into a human-readable title.
 * e.g., "two-sum" -> "Two Sum"
 */
export function formatSlugToTitle(slug: string): string {
  if (!slug) return 'LeetCode Problem';
  return slug
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

/**
 * Normalizes user-provided problem title by stripping common LeetCode suffixes.
 */
export function cleanProblemTitle(rawTitle: string, fallbackSlug: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return formatSlugToTitle(fallbackSlug);
  }

  const cleaned = rawTitle
    .replace(/\s*-\s*LeetCode.*$/i, '')
    .replace(/\s*-\s*力扣.*$/i, '')
    .trim();

  return cleaned.length > 0 ? cleaned : formatSlugToTitle(fallbackSlug);
}

/**
 * Normalizes difficulty to canonical Easy/Medium/Hard.
 */
export function normalizeDifficulty(raw?: string): ProblemDifficulty {
  if (!raw || typeof raw !== 'string') return 'Medium';
  const lower = raw.trim().toLowerCase();
  if (lower === 'easy') return 'Easy';
  if (lower === 'hard') return 'Hard';
  return 'Medium';
}

/**
 * Normalizes topic names to one of the standard pattern categories.
 */
export function normalizeTopic(raw?: string): string {
  if (!raw || typeof raw !== 'string') return 'Other';
  const trimmed = raw.trim();
  const matched = STANDARD_TOPICS.find((t) => t.toLowerCase() === trimmed.toLowerCase());
  return matched || trimmed;
}

