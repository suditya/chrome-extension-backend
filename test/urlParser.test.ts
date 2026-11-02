// test/urlParser.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLeetCodeUrl,
  extractSlug,
  canonicalizeUrl,
  formatSlugToTitle,
  cleanProblemTitle,
  normalizeDifficulty,
  normalizeTopic,
} from '../src/modules/problems/url.ts';

test('URL Parser: recognizes valid and invalid LeetCode URLs', () => {
  assert.strictEqual(isLeetCodeUrl('https://leetcode.com/problems/two-sum/'), true);
  assert.strictEqual(isLeetCodeUrl('https://leetcode.com/problems/trapping-rain-water/solutions/123/'), true);
  assert.strictEqual(isLeetCodeUrl('https://leetcode.cn/problems/3sum/submissions/'), true);
  assert.strictEqual(isLeetCodeUrl('http://leetcode.com/problems/merge-k-sorted-lists'), true);

  assert.strictEqual(isLeetCodeUrl('https://google.com/search'), false);
  assert.strictEqual(isLeetCodeUrl('https://leetcode.com/discuss/general-discussion'), false);
  assert.strictEqual(isLeetCodeUrl(''), false);
});

test('URL Parser: extracts clean slug from problem URL', () => {
  assert.strictEqual(extractSlug('https://leetcode.com/problems/two-sum/description/'), 'two-sum');
  assert.strictEqual(extractSlug('https://leetcode.cn/problems/LRU-CACHE/'), 'lru-cache');
  assert.strictEqual(extractSlug('invalid'), '');
});

test('URL Parser: canonicalizes URL removing extraneous paths and query strings', () => {
  const canonical = canonicalizeUrl('https://leetcode.com/problems/two-sum/solutions/382910/?envType=daily');
  assert.strictEqual(canonical, 'https://leetcode.com/problems/two-sum/');

  const cnCanonical = canonicalizeUrl('https://leetcode.cn/problems/3sum/description/');
  assert.strictEqual(cnCanonical, 'https://leetcode.cn/problems/3sum/');
});

test('URL Parser: slug to title formatting and title cleaning', () => {
  assert.strictEqual(formatSlugToTitle('binary-search-tree-iterator'), 'Binary Search Tree Iterator');
  assert.strictEqual(cleanProblemTitle('1. Two Sum - LeetCode', 'two-sum'), '1. Two Sum');
  assert.strictEqual(cleanProblemTitle(' - LeetCode', 'two-sum'), 'Two Sum');
});

test('URL Parser: normalizes difficulty and topics', () => {
  assert.strictEqual(normalizeDifficulty('easy'), 'Easy');
  assert.strictEqual(normalizeDifficulty('hard'), 'Hard');
  assert.strictEqual(normalizeDifficulty('unknown'), 'Medium');

  assert.strictEqual(normalizeTopic('dynamic programming'), 'Dynamic Programming');
  assert.strictEqual(normalizeTopic('binary search'), 'Binary Search');
  assert.strictEqual(normalizeTopic('unknown topic'), 'unknown topic');
});

