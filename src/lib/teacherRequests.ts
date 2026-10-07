import { QuerySnapshot, collection, deleteField, doc, getCountFromServer, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User } from '@/types';

// Teacher requests: a student asks for teacher access (teacherStatus 'pending'); the admin or the head teacher answers.
// The writes below are exactly what firestore.rules allows a head teacher to do (headTeacherAnswer): change a word here
// and tests/rules/head-teacher.test.ts says whether the rules still accept it.

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

export async function approveTeacherRequest(userId: string, approverUid: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), approvalUpdate(approverUid));
}

export async function declineTeacherRequest(userId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), DECLINE_UPDATE);
}

// The queries repeat what the rules demand of a head teacher's query (role == student, ONE request status):
// Firestore rules are not filters, a broader query would be refused as a whole.
const requestsQuery = (status: 'pending' | 'rejected') =>
  query(collection(db, 'users'), where('role', '==', 'student'), where('teacherStatus', '==', status));

export interface TeacherRequests {
  pending: User[];
  declined: User[];
}

const toUsers = (snap: QuerySnapshot) => snap.docs.map(d => ({ ...d.data(), uid: d.id } as User));

export async function fetchTeacherRequests(): Promise<TeacherRequests> {
  const [pending, declined] = await Promise.all([getDocs(requestsQuery('pending')), getDocs(requestsQuery('rejected'))]);
  return { pending: toUsers(pending), declined: toUsers(declined) };
}

/** For the badge in the menu: how many requests wait for an answer. */
export async function countPendingRequests(): Promise<number> {
  const snap = await getCountFromServer(requestsQuery('pending'));
  return snap.data().count;
}

/** Who may answer teacher requests in the app: the admin, and a teacher the admin made head teacher. */
export function canAnswerRequests(user: Pick<User, 'role' | 'headTeacher'> | null | undefined): boolean {
  return !!user && (user.role === 'admin' || (user.role === 'teacher' && user.headTeacher === true));
}
