import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Group } from '@/types';
import { appUrl } from './appUrl';

// No 0/O, 1/I/L: codes get read aloud and typed from a projector.
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
export async function fetchGroupsByIds(ids: string[]): Promise<Group[]> {
  const snaps = await Promise.all(ids.map(id => getDoc(doc(db, 'groups', id)).catch(() => null)));
  return snaps
    .filter((s): s is NonNullable<typeof s> => !!s && s.exists())
    .map(s => ({ id: s.id, ...s.data() } as Group));
}

export async function deleteGroup(code: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', code));
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
