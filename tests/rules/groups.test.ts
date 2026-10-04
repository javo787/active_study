import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { CODE_A, CODE_B, baseCast, seed, rulesEnv } from './helpers';

const getEnv = rulesEnv();

describe('groups: reading', () => {
  it('any signed-in user reads a group by its code, a visitor does not', async () => {
    await seed(getEnv(), baseCast);
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('student2').firestore(), `groups/${CODE_A}`)));
    await assertFails(getDoc(doc(getEnv().unauthenticatedContext().firestore(), `groups/${CODE_A}`)));
  });

  it('reading a code that does not exist is allowed (it simply is not there)', async () => {
    await seed(getEnv(), baseCast);
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('student2').firestore(), `groups/${CODE_B}`)));
  });

  it('the owner lists the own groups, nobody lists everything', async () => {
    await seed(getEnv(), baseCast);
    const teacher = getEnv().authenticatedContext('teacher1').firestore();
    await assertSucceeds(getDocs(query(collection(teacher, 'groups'), where('ownerId', '==', 'teacher1'))));
    await assertFails(getDocs(collection(teacher, 'groups')));
    await assertFails(getDocs(query(collection(teacher, 'groups'), where('ownerId', '==', 'teacher2'))));
    await assertFails(getDocs(collection(getEnv().authenticatedContext('student1').firestore(), 'groups')));
  });

  it('the admin lists all groups', async () => {
    await seed(getEnv(), baseCast);
    await assertSucceeds(getDocs(collection(getEnv().authenticatedContext('admin1').firestore(), 'groups')));
  });
});

describe('groups: creating', () => {
  const data = (ownerId: string) => ({ name: 'Physiology', ownerId, ownerName: 'Owner', createdAt: serverTimestamp() });

  it('a teacher creates a group they own, with a valid code', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertSucceeds(setDoc(doc(db, `groups/${CODE_B}`), data('teacher1')));
  });

  it('rejects ids that are too short, too long or contain odd characters', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertFails(setDoc(doc(db, 'groups/ABCD234'), data('teacher1')));
    await assertFails(setDoc(doc(db, 'groups/ABCD-234'), data('teacher1')));
    await assertFails(setDoc(doc(db, `groups/${'a'.repeat(41)}`), data('teacher1')));
  });

  it('accepts an automatic id (a current group does not use its code as the id)', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertSucceeds(setDoc(doc(db, 'groups/Xk3mPq9RzT2vLw8NaB4c'), data('teacher1')));
  });

  it('rejects an empty or an overlong name', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertFails(setDoc(doc(db, `groups/${CODE_B}`), { ...data('teacher1'), name: '' }));
    await assertFails(setDoc(doc(db, `groups/${CODE_B}`), { ...data('teacher1'), name: 'x'.repeat(81) }));
  });

  it('a teacher cannot create a group owned by somebody else', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertFails(setDoc(doc(db, `groups/${CODE_B}`), data('teacher2')));
  });

  it('a student cannot create a group', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(setDoc(doc(db, `groups/${CODE_B}`), data('student1')));
  });
});

describe('groups: updating and deleting', () => {
  it('the owner renames the group', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertSucceeds(updateDoc(doc(db, `groups/${CODE_A}`), { name: 'Anatomy 2', archived: true }));
  });

  it('the owner cannot hand the group over, the admin can', async () => {
    await seed(getEnv(), baseCast);
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), `groups/${CODE_A}`), { ownerId: 'teacher2' }));
    await assertSucceeds(updateDoc(doc(getEnv().authenticatedContext('admin1').firestore(), `groups/${CODE_A}`), { ownerId: 'teacher2' }));
  });

  it('the owner cannot write fields the rules do not know', async () => {
    await seed(getEnv(), baseCast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertFails(updateDoc(doc(db, `groups/${CODE_A}`), { createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, `groups/${CODE_A}`), { name: '' }));
    await assertFails(updateDoc(doc(db, `groups/${CODE_A}`), { archived: 'yes' }));
    await assertSucceeds(updateDoc(doc(db, `groups/${CODE_A}`), { description: 'Autumn term', updatedAt: serverTimestamp() }));
  });

  it('another teacher or a student cannot edit it', async () => {
    await seed(getEnv(), baseCast);
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), `groups/${CODE_A}`), { name: 'Mine now' }));
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('student1').firestore(), `groups/${CODE_A}`), { name: 'Mine now' }));
  });

  it('only the owner or the admin deletes it', async () => {
    await seed(getEnv(), baseCast);
    await assertFails(deleteDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), `groups/${CODE_A}`)));
    await assertFails(deleteDoc(doc(getEnv().authenticatedContext('student1').firestore(), `groups/${CODE_A}`)));
    await assertSucceeds(deleteDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), `groups/${CODE_A}`)));
  });
});
