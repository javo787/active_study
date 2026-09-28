import { collection, doc, writeBatch, getDocs, Timestamp, WriteBatch } from 'firebase/firestore';
import { db } from './firebase';
import { User } from '@/types';

export const EXAM_TTL_DAYS = 3;

export function expiryFromNow(days: number): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

type BatchOperation = (batch: WriteBatch) => void;

export async function commitInChunks(ops: BatchOperation[]) {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(op => op(batch));
    await batch.commit();
  }
}

export async function deleteExamCascade(examId: string) {
  const ops: BatchOperation[] = [];

  const variantsSnap = await getDocs(collection(db, `exams/${examId}/variants`));
  const variantIds = variantsSnap.docs.map(d => d.id);

  // 1. Delete questions
  for (const vId of variantIds) {
    const questionsSnap = await getDocs(collection(db, `exams/${examId}/variants/${vId}/questions`));
    questionsSnap.docs.forEach(qDoc => {
      ops.push(batch => batch.delete(qDoc.ref));
    });
  }

  // 2. Delete variants
  variantsSnap.docs.forEach(vDoc => {
    ops.push(batch => batch.delete(vDoc.ref));
  });

  // Execute child deletions first
  await commitInChunks(ops);

  // 3. Delete exam document last
  const examRef = doc(db, 'exams', examId);
  const finalBatch = writeBatch(db);
  finalBatch.delete(examRef);
  await finalBatch.commit();
}

export async function duplicateExam(examId: string, user: User): Promise<string> {
  // Read original exam
  const examRef = doc(db, 'exams', examId);
  const examSnap = await (await import('firebase/firestore')).getDoc(examRef);

  if (!examSnap.exists()) {
    throw new Error('Exam not found');
  }
  const originalExamData = examSnap.data();

  // Create new exam
  const newExamRef = doc(collection(db, 'exams'));
  const newExamId = newExamRef.id;
  const now = (await import('firebase/firestore')).serverTimestamp();
  const expiresAt = expiryFromNow(EXAM_TTL_DAYS);

  const initialBatch = writeBatch(db);
  initialBatch.set(newExamRef, {
    ...originalExamData,
    title: `Copy of ${originalExamData.title}`,
    isPublished: false,
    createdAt: now,
    expiresAt,
    createdBy: user.uid,
    createdByName: user.fullName || user.displayName,
  });
  await initialBatch.commit();

  // Copy variants and questions
  const ops: BatchOperation[] = [];
  const variantsSnap = await getDocs(collection(db, `exams/${examId}/variants`));

  for (const vDoc of variantsSnap.docs) {
    const originalVId = vDoc.id;
    const newVariantRef = doc(collection(db, `exams/${newExamId}/variants`));

    ops.push(batch => batch.set(newVariantRef, {
      examId: newExamId,
      expiresAt,
    }));

    const questionsSnap = await getDocs(collection(db, `exams/${examId}/variants/${originalVId}/questions`));
    questionsSnap.docs.forEach(qDoc => {
      const qData = qDoc.data();
      const newQuestionRef = doc(collection(db, `exams/${newExamId}/variants/${newVariantRef.id}/questions`));
      ops.push(batch => batch.set(newQuestionRef, {
        ...qData,
        expiresAt,
      }));
    });
  }

  await commitInChunks(ops);

  return newExamId;
}
