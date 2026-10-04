import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam, Group, GroupMember, RemovedMember } from '@/types';
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

/** The code a student types for this group. Legacy groups (never migrated) use their id as the code. */
export function groupCode(group: Pick<Group, 'id' | 'joinCode'>): string {
  return group.joinCode ?? group.id;
}

export class JoinGroupError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'closed' | 'removed' | 'failed', message: string) {
    super(message);
  }
}

function isPermissionDenied(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'permission-denied';
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// A write batch holds at most 500 operations; stay below it.
const BATCH_LIMIT = 400;

/** A code nobody uses yet: not a join code, and not the id of a legacy group (those ids are codes too). */
async function freshCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    const [asCode, asLegacyId] = await Promise.all([getDoc(doc(db, 'joinCodes', code)), getDoc(doc(db, 'groups', code))]);
    if (!asCode.exists() && !asLegacyId.exists()) return code;
  }
  throw new Error('Could not allocate a join code, try again');
}

/**
 * New groups get an automatic id; the join code is a separate document so it can be replaced without
 * breaking the group (exams, attempts and members all point at the id).
 */
export async function createGroup(owner: { uid: string; name: string }, name: string): Promise<Group> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error('Group name is required');

  try {
    return await createCurrentGroup(owner, trimmed);
  } catch (error) {
    // Rules from before the groups rework are still deployed: fall back to the old shape (id = code).
    if (isPermissionDenied(error)) return createLegacyGroup(owner, trimmed);
    throw error;
  }
}

async function createCurrentGroup(owner: { uid: string; name: string }, trimmed: string): Promise<Group> {
  const code = await freshCode();
  const ref = doc(collection(db, 'groups'));
  const batch = writeBatch(db);
  batch.set(ref, {
    name: trimmed,
    ownerId: owner.uid,
    ownerName: owner.name,
    joinCode: code,
    joinOpen: true,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'joinCodes', code), { groupId: ref.id, active: true });
  await batch.commit();
  const now = new Date();
  return { id: ref.id, name: trimmed, ownerId: owner.uid, ownerName: owner.name, joinCode: code, joinOpen: true, archived: false, createdAt: now, updatedAt: now };
}

async function createLegacyGroup(owner: { uid: string; name: string }, name: string): Promise<Group> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    const ref = doc(db, 'groups', code);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, { name, ownerId: owner.uid, ownerName: owner.name, createdAt: serverTimestamp() });
    return { id: code, name, ownerId: owner.uid, ownerName: owner.name, createdAt: new Date() };
  }
  throw new Error('Could not allocate a join code, try again');
}

/**
 * A legacy group (id = code, no joinCode) becomes a current one when its owner opens the groups page.
 * The code stays the same, so printed links and QR codes keep working. Returns the group unchanged if the
 * rules that allow it are not deployed yet.
 */
export async function migrateLegacyGroup(group: Group): Promise<Group> {
  if (group.joinCode) return group;
  const archived = group.archived ?? false;
  const batch = writeBatch(db);
  batch.set(doc(db, 'joinCodes', group.id), { groupId: group.id, active: true });
  batch.update(doc(db, 'groups', group.id), { joinCode: group.id, joinOpen: true, archived, updatedAt: serverTimestamp() });
  try {
    await batch.commit();
  } catch (error) {
    if (isPermissionDenied(error)) return group;
    throw error;
  }
  return { ...group, joinCode: group.id, joinOpen: true, archived };
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

/** Documents under a group that the owner must remove with it: after the group document is gone the rules can no longer tell who owned them. */
async function listGroupSubdocs(groupId: string): Promise<DocumentReference[]> {
  const refs: DocumentReference[] = [];
  for (const sub of ['members', 'removed']) {
    try {
      const snap = await getDocs(collection(db, 'groups', groupId, sub));
      snap.docs.forEach(d => refs.push(d.ref));
    } catch (error) {
      // Rules from before the groups rework do not know these collections: there is nothing to clean up then.
      if (!isPermissionDenied(error)) throw error;
    }
  }
  return refs;
}

export async function deleteGroupCascade(group: Group, exams: Exam[]): Promise<{ unpublished: number; detached: number }> {
  const { unpublishIds, detachIds } = planGroupDeletion(group.id, exams);

  if (unpublishIds.length + detachIds.length + 2 > BATCH_LIMIT) {
    throw new Error('Too many exams to delete at once (batch limit).');
  }

  // Members and removal marks first (in chunks, a class can be large). If this stops half way the group still
  // exists and the owner can simply delete it again.
  for (const part of chunk(await listGroupSubdocs(group.id), BATCH_LIMIT)) {
    const cleanup = writeBatch(db);
    part.forEach(ref => cleanup.delete(ref));
    await cleanup.commit();
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

  if (group.joinCode) batch.delete(doc(db, 'joinCodes', group.joinCode));
  batch.delete(doc(db, 'groups', group.id));
  await batch.commit();

  return { unpublished: unpublishIds.length, detached: detachIds.length };
}

export async function setGroupArchived(groupId: string, archived: boolean): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { archived, updatedAt: serverTimestamp() });
}

// ---- Teacher side: members, code, settings --------------------------------------------------------------

/** Students of a group who have a members record. Students who joined before the rework appear after they next open the app. */
export async function fetchMembers(groupId: string): Promise<GroupMember[]> {
  try {
    const snap = await getDocs(collection(db, 'groups', groupId, 'members'));
    return snap.docs
      .map(d => ({ uid: d.id, ...d.data() } as GroupMember))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  } catch (error) {
    if (isPermissionDenied(error)) return []; // old rules do not know the collection
    throw error;
  }
}

export async function fetchRemoved(groupId: string): Promise<RemovedMember[]> {
  try {
    const snap = await getDocs(collection(db, 'groups', groupId, 'removed'));
    return snap.docs
      .map(d => ({ uid: d.id, ...d.data() } as RemovedMember))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  } catch (error) {
    if (isPermissionDenied(error)) return [];
    throw error;
  }
}

/**
 * Removes a student: a mark that blocks coming back with the code, and the members record, in one batch. The
 * student's own app drops the group from the profile when it finds the mark (the owner cannot edit profiles).
 */
export async function removeMember(groupId: string, member: Pick<GroupMember, 'uid' | 'name'>): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'groups', groupId, 'removed', member.uid), { name: member.name ?? '', at: serverTimestamp() });
  batch.delete(doc(db, 'groups', groupId, 'members', member.uid));
  await batch.commit();
}

/** Lifts the mark: the student may join again with the current code. */
export async function restoreMember(groupId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupId, 'removed', uid));
}

/** Replaces the code. The old code and every link or QR made from it stop working at once; members stay. */
export async function rotateJoinCode(group: Group): Promise<string> {
  if (!group.joinCode) throw new Error('The group has not been upgraded yet');
  const code = await freshCode();
  const batch = writeBatch(db);
  batch.set(doc(db, 'joinCodes', code), { groupId: group.id, active: true });
  batch.update(doc(db, 'groups', group.id), { joinCode: code, updatedAt: serverTimestamp() });
  batch.delete(doc(db, 'joinCodes', group.joinCode));
  await batch.commit();
  return code;
}

export async function setGroupJoinOpen(groupId: string, joinOpen: boolean): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { joinOpen, updatedAt: serverTimestamp() });
}

export async function updateGroupDetails(groupId: string, details: { name: string; description: string }): Promise<{ name: string; description: string }> {
  const name = details.name.trim().slice(0, 80);
  const description = details.description.trim().slice(0, 200);
  if (!name) throw new Error('Group name is required');
  await updateDoc(doc(db, 'groups', groupId), { name, description, updatedAt: serverTimestamp() });
  return { name, description };
}

export interface GroupStudent {
  uid: string;
  /** Name shown to the teacher in the members list. */
  name: string;
  groupIds?: string[];
}

function memberRecord(student: GroupStudent, code: string) {
  return { name: student.name.slice(0, 120), code, joinedAt: serverTimestamp() };
}

/**
 * A student enters a code. For a current group the members record and groupIds are written in ONE batch (the
 * rules refuse groupIds without a valid code and a record). Legacy groups still accept the plain groupIds update.
 */
export async function joinGroupByCode(student: GroupStudent, rawCode: string): Promise<Group> {
  const code = normalizeJoinCode(rawCode);
  if (!isValidJoinCode(code)) throw new JoinGroupError('invalid', 'That code does not look right');

  const notFound = new JoinGroupError('not_found', 'No group with this code. It may have been replaced: ask your teacher for the current one.');

  const codeSnap = await getDoc(doc(db, 'joinCodes', code));
  const viaCode = codeSnap.exists();
  let groupId = code;
  if (viaCode) {
    if (codeSnap.data().active !== true) throw notFound;
    groupId = String(codeSnap.data().groupId);
  }

  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (!groupSnap.exists()) throw notFound;
  const group = { id: groupSnap.id, ...groupSnap.data() } as Group;
  const current = typeof group.joinCode === 'string';

  // The id of a current group is not an invitation; only its code is.
  if (current && !viaCode) throw notFound;
  if (current && group.joinOpen === false) {
    throw new JoinGroupError('closed', 'This group is not accepting new students right now. Ask your teacher.');
  }

  if ((student.groupIds ?? []).includes(groupId)) {
    await ensureMemberRecord(student, group).catch(() => {});
    return group;
  }

  if (await wasRemoved(student.uid, groupId)) {
    throw new JoinGroupError('removed', 'You were removed from this group. Ask your teacher if you should be back.');
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'groups', groupId, 'members', student.uid), memberRecord(student, code));
  batch.update(doc(db, 'users', student.uid), { groupIds: arrayUnion(groupId) });
  try {
    await batch.commit();
  } catch (error) {
    if (!current && isPermissionDenied(error)) {
      // Rules from before the groups rework: the old plain join.
      try {
        await updateDoc(doc(db, 'users', student.uid), { groupIds: arrayUnion(groupId) });
        return group;
      } catch (fallbackError) {
        console.error('Error joining group', fallbackError);
      }
    } else {
      console.error('Error joining group', error);
    }
    throw new JoinGroupError('failed', 'Could not join the group');
  }
  return group;
}

async function wasRemoved(uid: string, groupId: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'groups', groupId, 'removed', uid))).exists();
  } catch {
    return false; // unreadable (old rules): the server-side rules decide anyway
  }
}

async function ensureMemberRecord(student: GroupStudent, group: Group): Promise<void> {
  const ref = doc(db, 'groups', group.id, 'members', student.uid);
  if ((await getDoc(ref)).exists()) return;
  await setDoc(ref, memberRecord(student, groupCode(group)));
}

/** Leaving removes the members record and the id from groupIds together. */
export async function leaveGroupMembership(uid: string, groupId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'groups', groupId, 'members', uid));
  batch.update(doc(db, 'users', uid), { groupIds: arrayRemove(groupId) });
  try {
    await batch.commit();
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    await updateDoc(doc(db, 'users', uid), { groupIds: arrayRemove(groupId) }); // old rules
  }
}

/**
 * Run when a student opens the dashboard: finds the groups the owner removed the student from (the owner cannot
 * edit a student's profile, so the student's app drops them) and adds the members record that groups joined
 * before the rework do not have yet. Never throws: this is housekeeping.
 */
export async function reconcileMemberships(student: GroupStudent, groups: Group[]): Promise<{ removedIds: string[] }> {
  const removedIds: string[] = [];
  await Promise.allSettled(groups.map(async group => {
    if (await wasRemoved(student.uid, group.id)) {
      removedIds.push(group.id);
      return;
    }
    await ensureMemberRecord(student, group);
  }));
  return { removedIds };
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
