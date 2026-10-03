import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { arrayRemove, arrayUnion, collection, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { CODE_A, CODE_B, baseCast, seed, useRulesEnv, userDoc } from './helpers';

const getEnv = useRulesEnv();

describe('users: creating the own profile', () => {
  it('a new account may create its own student document', async () => {
    const db = getEnv().authenticatedContext('newbie').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/newbie'), userDoc('student', { uid: 'newbie' })));
  });

  it('cannot create a teacher or admin document', async () => {
    const db = getEnv().authenticatedContext('newbie').firestore();
    await assertFails(setDoc(doc(db, 'users/newbie'), userDoc('teacher')));
    await assertFails(setDoc(doc(db, 'users/newbie'), userDoc('admin')));
  });

  it('cannot start with a teacher request or with groups', async () => {
    const db = getEnv().authenticatedContext('newbie').firestore();
    await assertFails(setDoc(doc(db, 'users/newbie'), userDoc('student', { teacherStatus: 'pending' })));
    await assertFails(setDoc(doc(db, 'users/newbie'), userDoc('student', { groupIds: [CODE_A] })));
  });

  it('cannot create a document for somebody else', async () => {
    const db = getEnv().authenticatedContext('newbie').firestore();
    await assertFails(setDoc(doc(db, 'users/someoneelse'), userDoc('student')));
  });

  it('a signed-out visitor cannot create anything', async () => {
    const db = getEnv().unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'users/newbie'), userDoc('student')));
  });
});

describe('users: reading', () => {
  it('reads the own document, not somebody else\'s; admin reads any', async () => {
    await seed(getEnv(), baseCast);
    const student = getEnv().authenticatedContext('student1').firestore();
    await assertSucceeds(getDoc(doc(student, 'users/student1')));
    await assertFails(getDoc(doc(student, 'users/student2')));
    const admin = getEnv().authenticatedContext('admin1').firestore();
    await assertSucceeds(getDoc(doc(admin, 'users/student2')));
  });

  it('only the admin may list users', async () => {
    await seed(getEnv(), baseCast);
    await assertSucceeds(getDocs(collection(getEnv().authenticatedContext('admin1').firestore(), 'users')));
    await assertFails(getDocs(collection(getEnv().authenticatedContext('student1').firestore(), 'users')));
    await assertFails(getDocs(collection(getEnv().authenticatedContext('teacher1').firestore(), 'users')));
  });
});

describe('users: updating the own profile', () => {
  it('may edit profile fields', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/student1'), { fullName: 'Aziza Rahimova', university: 'ATSMU', course: 3 }));
  });

  it('can never change the own role', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(updateDoc(doc(db, 'users/student1'), { role: 'teacher' }));
    await assertFails(updateDoc(doc(db, 'users/student1'), { role: 'admin' }));
  });

  it('cannot edit somebody else\'s profile', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(updateDoc(doc(db, 'users/student2'), { fullName: 'Hacked' }));
  });
});

describe('users: teacher access request', () => {
  it('none -> pending is allowed', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/student2'), { teacherStatus: 'pending' }));
  });

  it('a pending request cannot be withdrawn, approved or rejected by the user', async () => {
    await seed(getEnv(), { ...baseCast, 'users/student2': userDoc('student', { teacherStatus: 'pending' }) });
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertFails(updateDoc(doc(db, 'users/student2'), { teacherStatus: deleteField() }));
    await assertFails(updateDoc(doc(db, 'users/student2'), { teacherStatus: 'rejected' }));
    await assertFails(updateDoc(doc(db, 'users/student2'), { teacherStatus: 'approved' }));
  });

  it('a rejected user cannot raise the request again', async () => {
    await seed(getEnv(), { ...baseCast, 'users/student2': userDoc('student', { teacherStatus: 'rejected' }) });
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertFails(updateDoc(doc(db, 'users/student2'), { teacherStatus: 'pending' }));
  });

  it('editing other fields while pending keeps working', async () => {
    await seed(getEnv(), { ...baseCast, 'users/student2': userDoc('student', { teacherStatus: 'pending' }) });
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/student2'), { department: 'Physiology' }));
  });

  it('the admin approves: role teacher and the request is cleared', async () => {
    await seed(getEnv(), { ...baseCast, 'users/student2': userDoc('student', { teacherStatus: 'pending' }) });
    const db = getEnv().authenticatedContext('admin1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/student2'), { role: 'teacher', teacherStatus: deleteField() }));
  });

  it('the admin may reject', async () => {
    await seed(getEnv(), { ...baseCast, 'users/student2': userDoc('student', { teacherStatus: 'pending' }) });
    const db = getEnv().authenticatedContext('admin1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/student2'), { teacherStatus: 'rejected' }));
  });
});

describe('users: group membership (users/{uid}.groupIds)', () => {
  it('joins one existing group', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/student2'), { groupIds: arrayUnion(CODE_A) }));
  });

  it('cannot join a group that does not exist', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertFails(updateDoc(doc(db, 'users/student2'), { groupIds: arrayUnion(CODE_B) }));
  });

  it('cannot add two groups in one write', async () => {
    await seed(getEnv(), { ...baseCast, [`groups/${CODE_B}`]: { name: 'Physiology', ownerId: 'teacher1' } });
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertFails(updateDoc(doc(db, 'users/student2'), { groupIds: arrayUnion(CODE_A, CODE_B) }));
  });

  it('may leave a group', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/student1'), { groupIds: arrayRemove(CODE_A) }));
  });

  it('may remove ids of groups that no longer exist', async () => {
    await seed(getEnv(), { ...baseCast, 'users/student2': userDoc('student', { groupIds: [CODE_B] }) });
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/student2'), { groupIds: arrayRemove(CODE_B) }));
  });

  it('is limited to 30 groups', async () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `FAKE000${i}`);
    await seed(getEnv(), { ...baseCast, 'users/student2': userDoc('student', { groupIds: thirty }) });
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertFails(updateDoc(doc(db, 'users/student2'), { groupIds: arrayUnion(CODE_A) }));
  });

  it('a teacher cannot put a student into a group', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertFails(updateDoc(doc(db, 'users/student2'), { groupIds: arrayUnion(CODE_A) }));
  });
});
