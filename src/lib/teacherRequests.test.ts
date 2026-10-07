import { describe, expect, it, vi } from 'vitest';

// The module imports the Firebase app; the pure parts under test need none of it.
vi.mock('@/lib/firebase', () => ({ db: {} }));

import { canAnswerRequests } from './teacherRequests';
import { DECLINE_UPDATE, approvalUpdate } from './teacherRequestUpdates';

describe('approvalUpdate', () => {
  it('writes exactly the keys the rules let a head teacher change', () => {
    expect(Object.keys(approvalUpdate('head1')).sort()).toEqual(
      ['expiresAt', 'role', 'teacherApprovedAt', 'teacherApprovedBy', 'teacherStatus'],
    );
  });

  it('makes the person a teacher and records who approved', () => {
    const update = approvalUpdate('head1');
    expect(update.role).toBe('teacher');
    expect(update.teacherApprovedBy).toBe('head1');
  });
});

describe('declining', () => {
  it('only moves the request to "rejected"', () => {
    expect(DECLINE_UPDATE).toEqual({ teacherStatus: 'rejected' });
  });
});

describe('canAnswerRequests', () => {
  it('admin and head teacher may, others may not', () => {
    expect(canAnswerRequests({ role: 'admin' })).toBe(true);
    expect(canAnswerRequests({ role: 'teacher', headTeacher: true })).toBe(true);
    expect(canAnswerRequests({ role: 'teacher' })).toBe(false);
    expect(canAnswerRequests({ role: 'teacher', headTeacher: false })).toBe(false);
  });

  it('a flag on a student does nothing, and nobody signed in may not', () => {
    expect(canAnswerRequests({ role: 'student', headTeacher: true })).toBe(false);
    expect(canAnswerRequests(null)).toBe(false);
    expect(canAnswerRequests(undefined)).toBe(false);
  });
});
