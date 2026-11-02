// src/modules/problems/types.ts

export type ProblemDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface Problem {
  slug: string;
  canonicalUrl: string;
  title: string;
  difficulty: ProblemDifficulty;
  topic: string;
  createdAt: Date;
  updatedAt: Date;
}

export const STANDARD_TOPICS = [
  'Arrays & Hashing',
  'Two Pointers',
  'Sliding Window',
  'Stack',
  'Binary Search',
  'Linked List',
  'Trees',
  'Tries',
  'Heap / Priority Queue',
  'Backtracking',
  'Graphs',
  'Dynamic Programming',
  'Greedy',
  'Intervals',
  'Math & Geometry',
  'Bit Manipulation',
  'Other',
] as const;

export type StandardTopic = (typeof STANDARD_TOPICS)[number];

