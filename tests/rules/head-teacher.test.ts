import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection, deleteField, doc, getCountFromServer, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { approvalUpdate } from '../../src/lib/teacherRequestUpdates';
import { seed, rulesEnv, userDoc } from './helpers';

const getEnv = rulesEnv();

// head1 is a teacher the admin made head teacher; teacher1 is an ordinary teacher.
// student1 asked for teacher access, student2 was declined, student3 never asked, student4 has the flag but is no teacher.
const cast = (): Record<string, Record<string, unknown>> => ({
  'users/head1': userDoc('teacher', { headTeacher: true }),
  'users/teacher1': userDoc('teacher'),
  'users/student1': userDoc('student', { teacherStatus: 'pending', fullName: 'Aziza R.', expiresAt: new Date() }),
  'users/student2': userDoc('student', { teacherStatus: 'rejected', expiresAt: new Date() }),
  'users/student3': userDoc('student'),
  'users/student4': userDoc('student', { headTeacher: true }),
  'users/admin1': userDoc('admin'),
});

const head = () => getEnv().authenticatedContext('head1').firestore();
// The same shape as src/lib/teacherRequests.ts: role == student, ONE request status.
const requestsQuery = (db: ReturnType<typeof head>, status: 'pending' | 'rejected') =>
  query(collection(db, 'users'), where('role', '==', 'student'), where('teacherStatus', '==', status));

describe('head teacher: seeing the requests', () => {
  it('reads a pending or declined request, not an ordinary profile', async () => {
    await seed(getEnv(), cast());
    await assertSucceeds(getDoc(doc(head(), 'users/student1')));
    await assertSucceeds(getDoc(doc(head(), 'users/student2')));
    await assertFails(getDoc(doc(head(), 'users/student3')));
    await assertFails(getDoc(doc(head(), 'users/teacher1')));
    await assertFails(getDoc(doc(head(), 'users/admin1')));
  });

  it('lists the requests with the query the app uses', async () => {
    await seed(getEnv(), cast());
    const pending = await assertSucceeds(getDocs(requestsQuery(head(), 'pending')));
    const declined = await assertSucceeds(getDocs(requestsQuery(head(), 'rejected')));
    if (pending.size !== 1 || declined.size !== 1) throw new Error(`expected 1 + 1, got ${pending.size} + ${declined.size}`);
  });

  it('counts the pending requests', async () => {
    await seed(getEnv(), cast());
    const count = await assertSucceeds(getCountFromServer(requestsQuery(head(), 'pending')));
    if (count.data().count !== 1) throw new Error(`expected 1, got ${count.data().count}`);
  });

  it('cannot list everybody, or all students', async () => {
    await seed(getEnv(), cast());
    await assertFails(getDocs(collection(head(), 'users')));
    await assertFails(getDocs(query(collection(head(), 'users'), where('role', '==', 'student'))));
    await assertFails(getDocs(query(collection(head(), 'users'), where('role', '==', 'teacher'))));
    await assertFails(getDocs(query(collection(head(), 'users'), where('teacherStatus', '==', 'pending'))));
  });

  it('an ordinary teacher sees no requests', async () => {
    await seed(getEnv(), cast());
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertFails(getDoc(doc(db, 'users/student1')));
    await assertFails(getDocs(requestsQuery(db, 'pending')));
  });

  it('the flag on a student account does nothing', async () => {
    await seed(getEnv(), cast());
    const db = getEnv().authenticatedContext('student4').firestore();
    await assertFails(getDoc(doc(db, 'users/student1')));
    await assertFails(getDocs(requestsQuery(db, 'pending')));
  });
});

describe('head teacher: answering a request', () => {
  it('approves: the person becomes a teacher, the request is gone, the approval is on record', async () => {
    await seed(getEnv(), cast());
    await assertSucceeds(updateDoc(doc(head(), 'users/student1'), approvalUpdate('head1')));
  });

  it('approves a declined request too (undoing a mistake)', async () => {
    await seed(getEnv(), cast());
    await assertSucceeds(updateDoc(doc(head(), 'users/student2'), approvalUpdate('head1')));
  });

  it('declines a pending request', async () => {
    await seed(getEnv(), cast());
    await assertSucceeds(updateDoc(doc(head(), 'users/student1'), { teacherStatus: 'rejected' }));
  });

  it('cannot return a declined request to "pending"', async () => {
    await seed(getEnv(), cast());
    await assertFails(updateDoc(doc(head(), 'users/student2'), { teacherStatus: 'pending' }));
  });

  it('cannot approve without recording who approved, or in somebody else\'s name', async () => {
    await seed(getEnv(), cast());
    await assertFails(updateDoc(doc(head(), 'users/student1'), { role: 'teacher', teacherStatus: deleteField(), expiresAt: deleteField() }));
    await assertFails(updateDoc(doc(head(), 'users/student1'), { ...approvalUpdate('teacher1') }));
    await assertFails(updateDoc(doc(head(), 'users/student1'), { ...approvalUpdate('head1'), teacherApprovedAt: new Date('2020-01-01') }));
  });

  it('cannot approve somebody who still carries the head teacher flag from an earlier role', async () => {
    await seed(getEnv(), {
      ...cast(),
      'users/student5': userDoc('student', { teacherStatus: 'pending', headTeacher: true, expiresAt: new Date() }),
    });
    await assertFails(updateDoc(doc(head(), 'users/student5'), approvalUpdate('head1')));
    // Declining is still fine: it grants nothing.
    await assertSucceeds(updateDoc(doc(head(), 'users/student5'), { teacherStatus: 'rejected' }));
  });

  it('cannot approve into any other role', async () => {
    await seed(getEnv(), cast());
    await assertFails(updateDoc(doc(head(), 'users/student1'), { ...approvalUpdate('head1'), role: 'admin' }));
  });

  it('cannot slip anything else into the same write', async () => {
    await seed(getEnv(), cast());
    await assertFails(updateDoc(doc(head(), 'users/student1'), { ...approvalUpdate('head1'), headTeacher: true }));
    await assertFails(updateDoc(doc(head(), 'users/student1'), { ...approvalUpdate('head1'), fullName: 'Renamed' }));
    await assertFails(updateDoc(doc(head(), 'users/student1'), { ...approvalUpdate('head1'), groupIds: ['ABCD2345'] }));
  });

  it('cannot edit a request without answering it, or the profile of somebody with no request', async () => {
    await seed(getEnv(), cast());
    await assertFails(updateDoc(doc(head(), 'users/student1'), { fullName: 'Renamed' }));
    await assertFails(updateDoc(doc(head(), 'users/student3'), approvalUpdate('head1')));
    await assertFails(updateDoc(doc(head(), 'users/student3'), { teacherStatus: 'rejected' }));
  });

  it('cannot touch teachers or the admin, or make anybody head teacher', async () => {
    await seed(getEnv(), cast());
    await assertFails(updateDoc(doc(head(), 'users/teacher1'), { headTeacher: true }));
    await assertFails(updateDoc(doc(head(), 'users/teacher1'), { role: 'student' }));
    await assertFails(updateDoc(doc(head(), 'users/admin1'), { role: 'student' }));
    await assertFails(updateDoc(doc(head(), 'users/student1'), { headTeacher: true }));
  });

  it('cannot delete a user', async () => {
    await seed(getEnv(), cast());
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(head(), 'users/student1')));
  });

  it('an ordinary teacher cannot answer requests', async () => {
    await seed(getEnv(), cast());
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertFails(updateDoc(doc(db, 'users/student1'), approvalUpdate('teacher1')));
    await assertFails(updateDoc(doc(db, 'users/student1'), { teacherStatus: 'rejected' }));
  });

  it('a student cannot answer requests, even holding the flag', async () => {
    await seed(getEnv(), cast());
    const db = getEnv().authenticatedContext('student4').firestore();
    await assertFails(updateDoc(doc(db, 'users/student1'), approvalUpdate('student4')));
  });
});

describe('head teacher: who may hold the flag', () => {
  it('the admin makes a teacher head teacher and takes it back', async () => {
    await seed(getEnv(), cast());
    const db = getEnv().authenticatedContext('admin1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/teacher1'), { headTeacher: true }));
    await assertSucceeds(updateDoc(doc(db, 'users/teacher1'), { headTeacher: deleteField() }));
  });

  it('nobody can give themselves the flag, nor the approval record', async () => {
    await seed(getEnv(), cast());
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'users/teacher1'), { headTeacher: true }));
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('student3').firestore(), 'users/student3'), { headTeacher: true }));
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('student3').firestore(), 'users/student3'), { teacherApprovedBy: 'head1' }));
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('student3').firestore(), 'users/student3'), { teacherApprovedAt: serverTimestamp() }));
  });

  it('a head teacher cannot remove their own flag or role (only the admin changes those)', async () => {
    await seed(getEnv(), cast());
    await assertFails(updateDoc(doc(head(), 'users/head1'), { headTeacher: deleteField() }));
    await assertFails(updateDoc(doc(head(), 'users/head1'), { role: 'admin' }));
  });

  it('a new account cannot be created with the flag or an approval record', async () => {
    const db = getEnv().authenticatedContext('newbie').firestore();
    await assertFails(setDoc(doc(db, 'users/newbie'), userDoc('student', { headTeacher: true })));
    await assertFails(setDoc(doc(db, 'users/newbie'), userDoc('student', { teacherApprovedBy: 'head1' })));
  });

  it('a head teacher still edits the own profile like any teacher', async () => {
    await seed(getEnv(), cast());
    await assertSucceeds(updateDoc(doc(head(), 'users/head1'), { fullName: 'Dr. Head', department: 'Anatomy' }));
  });
});
