import { QuerySnapshot, collection, doc, getCountFromServer, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DECLINE_UPDATE, approvalUpdate } from '@/lib/teacherRequestUpdates';
import { User } from '@/types';

// Teacher requests: a student asks for teacher access (teacherStatus 'pending'); the admin or the head teacher answers.
// The writes themselves (approvalUpdate, DECLINE_UPDATE) are in teacherRequestUpdates.ts.

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
