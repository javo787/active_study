import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { CODE_A, baseCast, examDoc, seed, rulesEnv } from './helpers';

const getEnv = rulesEnv();

const attempt = (extra: Record<string, unknown> = {}) => ({
  studentId: 'student1',
  teacherId: 'teacher1',
  examId: 'e1',
  status: 'in_progress',
  answers: {},
  ...extra,
});

const cast = {
  ...baseCast,
  'exams/e1': examDoc('teacher1'),
  'exams/e3': examDoc('teacher1', { visibility: 'link', groupIds: [] }),
};

describe('attempts: starting one', () => {
  it('a student in the audience starts an attempt with the deterministic id', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertSucceeds(setDoc(doc(db, 'attempts/student1_e1'), attempt({ groupIds: [CODE_A] })));
  });

  it('rejects an id that is not <uid>_<examId>', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(setDoc(doc(db, 'attempts/anything'), attempt()));
  });

  it('rejects a studentId that is not the signed-in user', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(setDoc(doc(db, 'attempts/student1_e1'), attempt({ studentId: 'student2' })));
  });

  it('rejects a teacherId that is not the exam owner, and a status other than in_progress', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(setDoc(doc(db, 'attempts/student1_e1'), attempt({ teacherId: 'teacher2' })));
    await assertFails(setDoc(doc(db, 'attempts/student1_e1'), attempt({ status: 'completed', score: 10 })));
  });

  it('a student outside the audience cannot start it, but can start a link-only exam', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('student2').firestore();
    await assertFails(setDoc(doc(db, 'attempts/student2_e1'), attempt({ studentId: 'student2' })));
    await assertSucceeds(setDoc(doc(db, 'attempts/student2_e3'), attempt({ studentId: 'student2', examId: 'e3' })));
  });

  it('an attempt for an exam that does not exist is refused', async () => {
    await seed(getEnv(), cast);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(setDoc(doc(db, 'attempts/student1_nope'), attempt({ examId: 'nope' })));
  });
});

describe('attempts: during and after', () => {
  const started = { ...cast, 'attempts/student1_e1': attempt() };

  it('the student saves answers and completes the attempt', async () => {
    await seed(getEnv(), started);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertSucceeds(updateDoc(doc(db, 'attempts/student1_e1'), { answers: { q1: 0 } }));
    await assertSucceeds(updateDoc(doc(db, 'attempts/student1_e1'), { status: 'completed', score: 1, totalQuestions: 1, finishedAt: serverTimestamp() }));
  });

  it('the student cannot touch protected fields', async () => {
    await seed(getEnv(), started);
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(updateDoc(doc(db, 'attempts/student1_e1'), { teacherId: 'teacher2' }));
    await assertFails(updateDoc(doc(db, 'attempts/student1_e1'), { studentId: 'student2' }));
    await assertFails(updateDoc(doc(db, 'attempts/student1_e1'), { groupIds: [CODE_A] }));
    await assertFails(updateDoc(doc(db, 'attempts/student1_e1'), { passingPercent: 0 }));
  });

  it('a finished attempt is frozen for the student', async () => {
    await seed(getEnv(), { ...cast, 'attempts/student1_e1': attempt({ status: 'completed', score: 1 }) });
    const db = getEnv().authenticatedContext('student1').firestore();
    await assertFails(updateDoc(doc(db, 'attempts/student1_e1'), { score: 100 }));
  });

  it('the teacher of the exam may reset the attempt, another teacher may not', async () => {
    await seed(getEnv(), started);
    await assertSucceeds(updateDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'attempts/student1_e1'), { resumeGraceOnce: true }));
    await assertFails(updateDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), 'attempts/student1_e1'), { resumeGraceOnce: true }));
  });

  it('only the teacher of the exam or the admin deletes it', async () => {
    await seed(getEnv(), started);
    await assertFails(deleteDoc(doc(getEnv().authenticatedContext('student1').firestore(), 'attempts/student1_e1')));
    await assertFails(deleteDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), 'attempts/student1_e1')));
    await assertSucceeds(deleteDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), 'attempts/student1_e1')));
  });
});

describe('attempts: reading', () => {
  const started = { ...cast, 'attempts/student1_e1': attempt() };

  it('the student, the exam teacher and the admin read it, others do not', async () => {
    await seed(getEnv(), started);
    const path = 'attempts/student1_e1';
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('student1').firestore(), path)));
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('teacher1').firestore(), path)));
    await assertSucceeds(getDoc(doc(getEnv().authenticatedContext('admin1').firestore(), path)));
    await assertFails(getDoc(doc(getEnv().authenticatedContext('student2').firestore(), path)));
    await assertFails(getDoc(doc(getEnv().authenticatedContext('teacher2').firestore(), path)));
  });

  it('lists are limited to the own attempts (student) or the own students (teacher)', async () => {
    await seed(getEnv(), started);
    const student = getEnv().authenticatedContext('student1').firestore();
    await assertSucceeds(getDocs(query(collection(student, 'attempts'), where('studentId', '==', 'student1'))));
    await assertFails(getDocs(query(collection(student, 'attempts'), where('studentId', '==', 'student2'))));
    await assertFails(getDocs(collection(student, 'attempts')));

    const teacher = getEnv().authenticatedContext('teacher1').firestore();
    await assertSucceeds(getDocs(query(collection(teacher, 'attempts'), where('teacherId', '==', 'teacher1'))));
    const other = getEnv().authenticatedContext('teacher2').firestore();
    await assertFails(getDocs(query(collection(other, 'attempts'), where('teacherId', '==', 'teacher1'))));
  });
});
