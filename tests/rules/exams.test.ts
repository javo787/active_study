import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { CODE_A, baseCast, examDoc, seed, useRulesEnv } from './helpers';

const getEnv = useRulesEnv();

const cast = {
  ...baseCast,
  'exams/e1': examDoc('teacher1'), // published, listed, group A
  'exams/e2': examDoc('teacher1', { isPublished: false }), // draft
  'exams/e3': examDoc('teacher1', { visibility: 'link', groupIds: [] }), // link-only
  'exams/e1/variants/v1': { examId: 'e1' },
  'exams/e1/variants/v1/questions/q1': { text: 'Question?', options: ['a', 'b'], correctIndex: 0 },
};

describe('exams: reading one exam', () => {
  it('a student in the audience reads a published exam, one outside it does not', async () => {
    await seed(getEnv(), cast);
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'exams/e1')));
    await assertFails(getDoc(doc(getEnv().authenticatedContext('student2').firestore(), 'exams/e1')));
  });

  it('a draft is visible to its owner and the admin only', async () => {
    await seed(getEnv(), cast);
    await assertFails(getDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'exams/e2')));
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'exams/e2')));
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('admin1').firestore(), 'exams/e2')));
    await assertFails(getDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), 'exams/e2')));
  });

  it('a link-only exam (no groups) opens for any signed-in user, not for visitors', async () => {
    await seed(getEnv(), cast);
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('student2').firestore(), 'exams/e3')));
    await assertFails(getDoc(doc(getEnv().unauthenticatedContext().firestore(), 'exams/e3')));
  });

  it('another teacher is outside the audience too', async () => {
    await seed(getEnv(), cast);
    await assertFails(getDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), 'exams/e1')));
  });

  it('reading an exam that does not exist is allowed (it simply is not there)', async () => {
    await seed(getEnv(), cast);
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'exams/missing')));
  });
});

describe('exams: listing', () => {
  it('the owner lists the own exams', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertSucceeds(getDocs(query(collection(db, 'exams'), where('createdBy', '==', 'teacher1'))));
  });

  it('another teacher cannot list somebody else\'s exams', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('teacher2').firestore();
    await assertFails(getDocs(query(collection(db, 'exams'), where('createdBy', '==', 'teacher1'))));
  });

  it('a student must filter by published exams, an open query is refused', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertSucceeds(getDocs(query(collection(db, 'exams'), where('isPublished', '==', true), where('groupIds', 'array-contains-any', [CODE_A]))));
    await assertFails(getDocs(collection(db, 'exams')));
  });
});

describe('exams: writing', () => {
  it('a teacher creates an exam as themselves, a student cannot', async () => {
    await seed(getEnv(), cast);
    await assertSucceeds(setDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'exams/new1'), examDoc('teacher1')));
    await assertFails(setDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'exams/new2'), examDoc('teacher2')));
    await assertFails(setDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'exams/new3'), examDoc('student1')));
  });

  it('the owner edits and deletes, others cannot', async () => {
    await seed(getEnv(), cast);
    await assertSucceeds(updateDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'exams/e1'), { title: 'Renamed' }));
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), 'exams/e1'), { title: 'Mine now' }));
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'exams/e1'), { createdBy: 'teacher2' }));
    await assertFails(deleteDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'exams/e1')));
    await assertSucceeds(deleteDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'exams/e1')));
  });

  it('removing a group and unpublishing in one write (what deleting a group does) is allowed for the owner', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('teacher1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'exams/e1'), { groupIds: arrayRemove(CODE_A), isPublished: false }));
    await assertFails(getDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'exams/e1')));
  });
});

describe('exams: variants and questions', () => {
  it('questions are readable inside the audience only', async () => {
    await seed(getEnv(), cast);
    const path = 'exams/e1/variants/v1/questions/q1';
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('student1').firestore(), path)));
    await assertFails(getDoc(doc(getEnv().authenticatedContext('student2').firestore(), path)));
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), path)));
    await assertFails(getDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), path)));
  });

  it('questions of a draft are not readable by students', async () => {
    await seed(getEnv(), { ...cast, 'exams/e2/variants/v1/questions/q1': { text: 'Hidden' } });
    await assertFails(getDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'exams/e2/variants/v1/questions/q1')));
  });

  it('only the exam owner writes questions', async () => {
    await seed(getEnv(), cast);
    const path = 'exams/e1/variants/v1/questions/q2';
    await assertSucceeds(setDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), path), { text: 'New' }));
    await assertFails(setDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), path), { text: 'Sneaky' }));
    await assertFails(setDoc(doc(getEnv().authenticatedContext('student1').firestore(), path), { text: 'Sneaky' }));
  });
});

// These tests pin today's behaviour of two known gaps so that nobody closes them by accident without noticing,
// and so the groups rework (docs: the plan, findings F1 and F15) has a test to flip.
describe('exams: known gaps (to be closed by the groups rework)', () => {
  it('F15: any signed-in user can list every published exam, including link-only ones', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertSucceeds(getDocs(query(collection(db, 'exams'), where('isPublished', '==', true))));
  });

  it('F1 (rules side): a student keeps access through the id of a group that no longer exists', async () => {
    const withoutGroup = Object.fromEntries(Object.entries(cast).filter(([path]) => path !== `groups/${CODE_A}`));
    await seed(getEnv(), withoutGroup);
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'exams/e1')));
  });
});
