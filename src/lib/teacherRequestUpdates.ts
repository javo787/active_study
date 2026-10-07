import { deleteField, serverTimestamp } from 'firebase/firestore';

// The two writes a head teacher is allowed to make on a teacher request (firestore.rules: headTeacherAnswer).
// They live apart from teacherRequests.ts, which imports the Firebase app, so the rules tests can use them
// without starting one: tests/rules/head-teacher.test.ts says whether the rules still accept exactly these.

/** Approving: student -> teacher. The request and the student's 30-day expiry go away, and who approved stays on record. */
export function approvalUpdate(approverUid: string): Record<string, unknown> {
  return {
    role: 'teacher',
    teacherStatus: deleteField(),
    expiresAt: deleteField(),
    teacherApprovedBy: approverUid,
    teacherApprovedAt: serverTimestamp(),
  };
}

/** Declining keeps the request visible as "declined", so a mistake can be undone by approving it later. */
export const DECLINE_UPDATE = { teacherStatus: 'rejected' } as const;
