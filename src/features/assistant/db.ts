// The student's local storage. One IndexedDB database per signed-in user, so two people sharing a device never see
// each other's banks. Nothing here is sent anywhere.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssistBank, AssistQuestion, AssistSession, QuestionProgress } from './types';

interface AssistSchema extends DBSchema {
  banks: { key: string; value: AssistBank };
  questions: { key: string; value: AssistQuestion; indexes: { byBank: string } };
  progress: { key: string; value: QuestionProgress; indexes: { byBank: string } };
  sessions: { key: string; value: AssistSession; indexes: { byBank: string } };
}

export type AssistIDB = IDBPDatabase<AssistSchema>;

const DB_VERSION = 1;
export const dbNameFor = (uid: string) => `edu-assistant:${uid}`;

export async function openAssistDb(uid: string): Promise<AssistIDB> {
  return openDB<AssistSchema>(dbNameFor(uid), DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('banks', { keyPath: 'id' });
      db.createObjectStore('questions', { keyPath: 'id' }).createIndex('byBank', 'bankId');
      db.createObjectStore('progress', { keyPath: 'id' }).createIndex('byBank', 'bankId');
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('byBank', 'bankId');
    },
  });
}

export async function saveBank(db: AssistIDB, bank: AssistBank, questions: readonly AssistQuestion[]): Promise<void> {
  const tx = db.transaction(['banks', 'questions'], 'readwrite');
  await tx.objectStore('banks').put(bank);
  const store = tx.objectStore('questions');
  for (const q of questions) await store.put(q);
  await tx.done;
}

export async function listBanks(db: AssistIDB): Promise<AssistBank[]> {
  const all = await db.getAll('banks');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getBank(db: AssistIDB, bankId: string): Promise<AssistBank | undefined> {
  return db.get('banks', bankId);
}

export async function getQuestions(db: AssistIDB, bankId: string): Promise<AssistQuestion[]> {
  const all = await db.getAllFromIndex('questions', 'byBank', bankId);
  return all.sort((a, b) => a.index - b.index);
}

export async function renameBank(db: AssistIDB, bankId: string, title: string, now: number): Promise<void> {
  const bank = await db.get('banks', bankId);
  const clean = title.trim();
  if (!bank || !clean) return;
  await db.put('banks', { ...bank, title: clean, updatedAt: now });
}

export async function deleteBank(db: AssistIDB, bankId: string): Promise<void> {
  const tx = db.transaction(['banks', 'questions', 'progress', 'sessions'], 'readwrite');
  await tx.objectStore('banks').delete(bankId);
  for (const name of ['questions', 'progress', 'sessions'] as const) {
    const store = tx.objectStore(name);
    const keys = await store.index('byBank').getAllKeys(bankId);
    for (const key of keys) await store.delete(key);
  }
  await tx.done;
}

export async function getProgress(db: AssistIDB, bankId: string): Promise<Map<string, QuestionProgress>> {
  const rows = await db.getAllFromIndex('progress', 'byBank', bankId);
  return new Map(rows.map(r => [r.questionId, r]));
}

/** Progress of every bank at once, for the list. */
export async function getAllProgress(db: AssistIDB): Promise<Map<string, QuestionProgress>> {
  const rows = await db.getAll('progress');
  return new Map(rows.map(r => [r.questionId, r]));
}

export async function putProgress(db: AssistIDB, items: readonly QuestionProgress[]): Promise<void> {
  if (items.length === 0) return;
  const tx = db.transaction('progress', 'readwrite');
  for (const item of items) await tx.store.put(item);
  await tx.done;
}

export async function saveSession(db: AssistIDB, session: AssistSession): Promise<void> {
  await db.put('sessions', session);
}

export async function getSession(db: AssistIDB, sessionId: string): Promise<AssistSession | undefined> {
  return db.get('sessions', sessionId);
}

export async function deleteSession(db: AssistIDB, sessionId: string): Promise<void> {
  await db.delete('sessions', sessionId);
}

export async function listSessions(db: AssistIDB, bankId: string): Promise<AssistSession[]> {
  const all = await db.getAllFromIndex('sessions', 'byBank', bankId);
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

/** The newest session of a bank that is still running (not ended and not out of time), if any. */
export async function getOpenSession(db: AssistIDB, bankId: string, now: number): Promise<AssistSession | undefined> {
  const all = await listSessions(db, bankId);
  return all.find(s => !s.endedAt && (s.deadline === undefined || now < s.deadline));
}

/**
 * Asks the browser not to evict this origin's data under storage pressure. It is a request, not a guarantee, and
 * some browsers (notably Safari for sites that are not installed) may still clear it: hence the backup export.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      if (await navigator.storage.persisted?.()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // not available: nothing to do
  }
  return false;
}
