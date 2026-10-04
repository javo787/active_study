import { arrayRemove, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam, Group } from '@/types';
import { appUrl } from './appUrl';

// No 0/O, 1/I: codes get read aloud and typed from a projector. L stays in the alphabet (existing codes may contain it).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars -> uniform with a byte % 32
export const JOIN_CODE_LENGTH = 8;
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const PENDING_KEY = 'pending_join_code_v1';

export function generateJoinCode(): string {
  const bytes = new Uint8Array(JOIN_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** "abcd-2345" / " ABCD 2345 " -> "ABCD2345" */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidJoinCode(code: string): boolean {
  return CODE_RE.test(code);
}

export function formatJoinCode(code: string): string {
  return code.length === JOIN_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function inviteLink(code: string): string {
  return appUrl(`/join?code=${code}`);
}

export class JoinGroupError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'failed', message: string) {
    super(message);
  }
}

export async function createGroup(owner: { uid: string; name: string }, name: string): Promise<Group> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Group name is required');

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    const ref = doc(db, 'groups', code);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, {
      name: trimmed.slice(0, 80),
      ownerId: owner.uid,
      ownerName: owner.name,
      createdAt: serverTimestamp(),
    });
    return { id: code, name: trimmed.slice(0, 80), ownerId: owner.uid, ownerName: owner.name, createdAt: new Date() };
  }
  throw new Error('Could not allocate a join code, try again');
}

export async function fetchOwnedGroups(ownerId: string): Promise<Group[]> {
  const snap = await getDocs(query(collection(db, 'groups'), where('ownerId', '==', ownerId)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Group))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Groups that no longer exist (deleted by the teacher) are silently dropped. */
export async function fetchGroupsByIds(ids: string[]): Promise<{ groups: Group[]; missingIds: string[] }> {
  const results = await Promise.allSettled(ids.map(id => getDoc(doc(db, 'groups', id))));
  const groups: Group[] = [];
  const missingIds: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const snap = result.value;
      if (snap.exists()) {
        groups.push({ id: snap.id, ...snap.data() } as Group);
      } else {
        missingIds.push(ids[index]);
      }
    }
    // If rejected, we do nothing; transient error must not be treated as deleted.
  });

  return { groups, missingIds };
}

export async function fetchGroupExams(ownerUid: string, groupId: string): Promise<Exam[]> {
  const snap = await getDocs(query(collection(db, 'exams'), where('createdBy', '==', ownerUid)));
  const exams = snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam));
  return exams.filter(e => e.groupIds?.includes(groupId));
}

export function planGroupDeletion(groupId: string, exams: Exam[]): { unpublishIds: string[]; detachIds: string[] } {
  const unpublishIds: string[] = [];
  const detachIds: string[] = [];

  for (const exam of exams) {
    if (!exam.groupIds || !exam.groupIds.includes(groupId)) continue;

    // If the exam has only this group, or all other groups are somehow empty string (shouldn't happen, but safe)
    const otherGroups = exam.groupIds.filter(id => id !== groupId);
    if (otherGroups.length === 0) {
      unpublishIds.push(exam.id);
    } else {
      detachIds.push(exam.id);
    }
  }

  return { unpublishIds, detachIds };
}

export async function deleteGroupCascade(group: Group, exams: Exam[]): Promise<{ unpublished: number; detached: number }> {
  const { unpublishIds, detachIds } = planGroupDeletion(group.id, exams);

  if (unpublishIds.length + detachIds.length + 1 > 400) {
    throw new Error('Too many exams to delete at once (batch limit).');
  }

  const batch = writeBatch(db);

  for (const id of unpublishIds) {
    batch.update(doc(db, 'exams', id), {
      groupIds: arrayRemove(group.id),
      isPublished: false
    });
  }

  for (const id of detachIds) {
    batch.update(doc(db, 'exams', id), {
      groupIds: arrayRemove(group.id)
    });
  }

  batch.delete(doc(db, 'groups', group.id));
  await batch.commit();

  return { unpublished: unpublishIds.length, detached: detachIds.length };
}

export async function setGroupArchived(groupId: string, archived: boolean): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { archived });
}

// A student who opens an invite link while signed out has to log in first
// (Google popup or Telegram), so the code waits in localStorage until the dashboard picks it up.
export function savePendingJoinCode(code: string) {
  try {
    localStorage.setItem(PENDING_KEY, code);
  } catch {}
}

export function peekPendingJoinCode(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingJoinCode() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}
