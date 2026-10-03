import { describe, expect, it, vi } from 'vitest';
import type { Exam } from '@/types';

// groups.ts imports the Firebase app at load time; the pure helpers under test never touch it.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));

import {
  JOIN_CODE_LENGTH,
  formatJoinCode,
  generateJoinCode,
  inviteLink,
  isValidJoinCode,
  normalizeJoinCode,
  planGroupDeletion,
} from './groups';

const exam = (id: string, groupIds?: string[]): Exam =>
  ({ id, title: id, timeLimit: 10, isPublished: true, groupIds } as unknown as Exam);

describe('join codes', () => {
  it('generates 8 characters from the unambiguous alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect(isValidJoinCode(code)).toBe(true);
      expect(code).not.toMatch(/[01IO]/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(495);
  });

  it('normalizes what people type or paste', () => {
    expect(normalizeJoinCode('abcd-2345')).toBe('ABCD2345');
    expect(normalizeJoinCode(' ABCD 2345 ')).toBe('ABCD2345');
    expect(normalizeJoinCode('abcd2345')).toBe('ABCD2345');
  });

  it('validates the shape of a code', () => {
    expect(isValidJoinCode('ABCD2345')).toBe(true);
    expect(isValidJoinCode('abcd2345')).toBe(false);
    expect(isValidJoinCode('ABCD234')).toBe(false);
    expect(isValidJoinCode('ABCD23456')).toBe(false);
    expect(isValidJoinCode('ABCD0OIL')).toBe(false);
    expect(isValidJoinCode('')).toBe(false);
  });

  it('formats a code in two blocks of four, leaving odd input alone', () => {
    expect(formatJoinCode('ABCD2345')).toBe('ABCD-2345');
    expect(formatJoinCode('SHORT')).toBe('SHORT');
  });

  it('builds the invite link with the code', () => {
    expect(inviteLink('ABCD2345')).toContain('/join?code=ABCD2345');
  });
});

describe('planGroupDeletion', () => {
  it('unpublishes an exam whose only group is deleted', () => {
    expect(planGroupDeletion('G1', [exam('a', ['G1'])])).toEqual({ unpublishIds: ['a'], detachIds: [] });
  });

  it('only detaches the group from an exam that has other groups', () => {
    expect(planGroupDeletion('G1', [exam('a', ['G1', 'G2'])])).toEqual({ unpublishIds: [], detachIds: ['a'] });
  });

  it('ignores exams that do not use the group, and link-only exams', () => {
    const plan = planGroupDeletion('G1', [exam('a', ['G2']), exam('b', []), exam('c')]);
    expect(plan).toEqual({ unpublishIds: [], detachIds: [] });
  });

  it('splits a mixed list', () => {
    const plan = planGroupDeletion('G1', [exam('a', ['G1']), exam('b', ['G1', 'G3']), exam('c', ['G3'])]);
    expect(plan).toEqual({ unpublishIds: ['a'], detachIds: ['b'] });
  });
});
