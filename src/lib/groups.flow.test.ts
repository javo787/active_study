import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exam, Group } from '@/types';

// An in-memory stand-in for Firestore, just big enough for the group flows. The security rules themselves are
// covered by tests/rules (real emulator); this file checks what the CLIENT does with the answers it gets.
type Data = Record<string, unknown>;
const store = new Map<string, Data>();
let deniedWrites: (path: string) => boolean = () => false;
let deniedReads: (path: string) => boolean = () => false;
let autoId = 0;

vi.mock('@/lib/firebase', () => ({ db: { isDb: true }, auth: {} }));

vi.mock('firebase/firestore', () => {
  const denied = () => Object.assign(new Error('denied'), { code: 'permission-denied' });
  type Ref = { path: string; id: string; isCollection?: boolean };
  const ref = (path: string): Ref => ({ path, id: path.split('/').pop() as string });
  const applyUpdate = (path: string, patch: Data) => {
    const current = store.get(path);
    if (!current) throw Object.assign(new Error('not found'), { code: 'not-found' });
    const next: Data = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      const op = value as { __op?: string; values?: string[] } | null;
      const list = (next[key] as string[] | undefined) ?? [];
      if (op?.__op === 'union') next[key] = [...list, ...(op.values ?? []).filter(v => !list.includes(v))];
      else if (op?.__op === 'remove') next[key] = list.filter(v => !(op.values ?? []).includes(v));
      else next[key] = value;
    }
    store.set(path, next);
  };
  return {
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/'), id: segments[segments.length - 1], isCollection: true }),
    doc: (base: Ref | { isDb?: boolean }, ...segments: string[]) =>
      (base as Ref).isCollection ? ref(`${(base as Ref).path}/auto${++autoId}`) : ref(segments.join('/')),
    serverTimestamp: () => ({ __ts: true }),
    arrayUnion: (...values: string[]) => ({ __op: 'union', values }),
    arrayRemove: (...values: string[]) => ({ __op: 'remove', values }),
    where: () => ({}),
    query: (c: Ref) => c,
    getDoc: async (r: Ref) => {
      if (deniedReads(r.path)) throw denied();
      return { id: r.id, exists: () => store.has(r.path), data: () => store.get(r.path) };
    },
    getDocs: async (c: Ref) => {
      if (deniedReads(c.path)) throw denied();
      const depth = c.path.split('/').length + 1;
      const docs = Array.from(store.entries())
        .filter(([path]) => path.startsWith(`${c.path}/`) && path.split('/').length === depth)
        .map(([path, data]) => ({ id: path.split('/').pop(), ref: ref(path), data: () => data }));
      return { docs };
    },
    setDoc: async (r: Ref, data: Data) => {
      if (deniedWrites(r.path)) throw denied();
      store.set(r.path, data);
    },
    updateDoc: async (r: Ref, patch: Data) => {
      if (deniedWrites(r.path)) throw denied();
      applyUpdate(r.path, patch);
    },
    deleteDoc: async (r: Ref) => {
      if (deniedWrites(r.path)) throw denied();
      store.delete(r.path);
    },
    writeBatch: () => {
      const ops: Array<() => void> = [];
      const paths: string[] = [];
      const batch = {
        set: (r: Ref, data: Data) => { paths.push(r.path); ops.push(() => store.set(r.path, data)); return batch; },
        update: (r: Ref, patch: Data) => { paths.push(r.path); ops.push(() => applyUpdate(r.path, patch)); return batch; },
        delete: (r: Ref) => { paths.push(r.path); ops.push(() => store.delete(r.path)); return batch; },
        commit: async () => {
          if (paths.some(p => deniedWrites(p))) throw denied(); // a batch is all or nothing
          ops.forEach(op => op());
        },
      };
      return batch;
    },
  };
});

import {
  JoinGroupError,
  chunk,
  createGroup,
  deleteGroupCascade,
  fetchMembers,
  fetchRemoved,
  groupCode,
  joinGroupByCode,
  leaveGroupMembership,
  migrateLegacyGroup,
  reconcileMemberships,
  removeMember,
  restoreMember,
  rotateJoinCode,
  setGroupJoinOpen,
  updateGroupDetails,
} from './groups';

const CODE = 'QRST2345';
const GID = 'grpAnatomy0001';
const student = (groupIds: string[] = []) => ({ uid: 's1', name: 'Aziza', groupIds });

function seedCurrent(extra: Data = {}, codeDoc: Data = { groupId: GID, active: true }) {
  store.set(`groups/${GID}`, { name: 'Anatomy', ownerId: 't1', joinCode: CODE, joinOpen: true, ...extra });
  store.set(`joinCodes/${CODE}`, codeDoc);
}

beforeEach(() => {
  store.clear();
  deniedWrites = () => false;
  deniedReads = () => false;
  autoId = 0;
  store.set('users/s1', { role: 'student', groupIds: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('joinGroupByCode', () => {
  it('joins a current group: members record and groupIds are written together', async () => {
    seedCurrent();
    const group = await joinGroupByCode(student(), 'qrst-2345');
    expect(group.id).toBe(GID);
    expect(store.get(`groups/${GID}/members/s1`)).toMatchObject({ name: 'Aziza', code: CODE });
    expect(store.get('users/s1')?.groupIds).toEqual([GID]);
  });

  it('refuses a malformed code before touching the database', async () => {
    await expect(joinGroupByCode(student(), 'nope')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('says not_found for an unknown code, a deactivated code, and a group id typed as a code', async () => {
    await expect(joinGroupByCode(student(), 'WXYZ6789')).rejects.toMatchObject({ code: 'not_found' });

    seedCurrent({}, { groupId: GID, active: false });
    await expect(joinGroupByCode(student(), CODE)).rejects.toMatchObject({ code: 'not_found' });

    // A migrated-then-rotated group whose id still looks like a code: the id is not an invitation any more.
    store.set('groups/ABCD2345', { name: 'Old', ownerId: 't1', joinCode: 'EFGH6789' });
    await expect(joinGroupByCode(student(), 'ABCD2345')).rejects.toMatchObject({ code: 'not_found' });
    expect(store.get('users/s1')?.groupIds).toEqual([]);
  });

  it('refuses a closed group and writes nothing', async () => {
    seedCurrent({ joinOpen: false });
    await expect(joinGroupByCode(student(), CODE)).rejects.toMatchObject({ code: 'closed' });
    expect(store.has(`groups/${GID}/members/s1`)).toBe(false);
  });

  it('refuses a student the owner removed', async () => {
    seedCurrent();
    store.set(`groups/${GID}/removed/s1`, { name: 'Aziza' });
    await expect(joinGroupByCode(student(), CODE)).rejects.toMatchObject({ code: 'removed' });
    expect(store.get('users/s1')?.groupIds).toEqual([]);
  });

  it('a student who is already in the group only gets the missing members record', async () => {
    seedCurrent();
    store.set('users/s1', { role: 'student', groupIds: [GID] });
    await joinGroupByCode(student([GID]), CODE);
    expect(store.get('users/s1')?.groupIds).toEqual([GID]);
    expect(store.get(`groups/${GID}/members/s1`)).toMatchObject({ code: CODE });
  });

  it('a legacy group (id = code, no joinCode) is joined the same way', async () => {
    store.set('groups/ABCD2345', { name: 'Legacy', ownerId: 't1' });
    await joinGroupByCode(student(), 'ABCD2345');
    expect(store.get('users/s1')?.groupIds).toEqual(['ABCD2345']);
    expect(store.get('groups/ABCD2345/members/s1')).toMatchObject({ code: 'ABCD2345' });
  });

  it('with the old rules still deployed a legacy join falls back to the plain groupIds update', async () => {
    store.set('groups/ABCD2345', { name: 'Legacy', ownerId: 't1' });
    deniedWrites = path => path.includes('/members/');
    await joinGroupByCode(student(), 'ABCD2345');
    expect(store.get('users/s1')?.groupIds).toEqual(['ABCD2345']);
    expect(store.has('groups/ABCD2345/members/s1')).toBe(false);
  });

  it('a current group has no fallback: a refused batch is a failed join and nothing is written', async () => {
    seedCurrent();
    deniedWrites = () => true;
    await expect(joinGroupByCode(student(), CODE)).rejects.toBeInstanceOf(JoinGroupError);
    expect(store.get('users/s1')?.groupIds).toEqual([]);
  });
});

describe('leaveGroupMembership', () => {
  it('removes the record and the id together', async () => {
    seedCurrent();
    store.set('users/s1', { role: 'student', groupIds: [GID, 'OTHER000'] });
    store.set(`groups/${GID}/members/s1`, { name: 'Aziza' });
    await leaveGroupMembership('s1', GID);
    expect(store.has(`groups/${GID}/members/s1`)).toBe(false);
    expect(store.get('users/s1')?.groupIds).toEqual(['OTHER000']);
  });

  it('falls back to the plain update when the old rules refuse the batch', async () => {
    store.set('users/s1', { role: 'student', groupIds: [GID] });
    deniedWrites = path => path.includes('/members/');
    await leaveGroupMembership('s1', GID);
    expect(store.get('users/s1')?.groupIds).toEqual([]);
  });
});

describe('reconcileMemberships', () => {
  const group = (id: string, extra: Partial<Group> = {}) => ({ id, name: id, ownerId: 't1', createdAt: new Date(), ...extra }) as Group;

  it('reports removed groups and registers a missing record for the others', async () => {
    store.set('groups/gone/removed/s1', { name: 'Aziza' });
    const { removedIds } = await reconcileMemberships(student(['gone', 'kept']), [group('gone'), group('kept', { joinCode: CODE })]);
    expect(removedIds).toEqual(['gone']);
    expect(store.has('groups/gone/members/s1')).toBe(false);
    expect(store.get('groups/kept/members/s1')).toMatchObject({ name: 'Aziza', code: CODE });
  });

  it('never throws, even when everything is refused', async () => {
    deniedReads = () => true;
    deniedWrites = () => true;
    await expect(reconcileMemberships(student(['a']), [group('a')])).resolves.toEqual({ removedIds: [] });
  });

  it('does not overwrite an existing record', async () => {
    store.set('groups/kept/members/s1', { name: 'Edited', code: 'X' });
    await reconcileMemberships(student(['kept']), [group('kept')]);
    expect(store.get('groups/kept/members/s1')).toEqual({ name: 'Edited', code: 'X' });
  });
});

describe('createGroup', () => {
  it('creates the group and its join code together; the id is not the code', async () => {
    const group = await createGroup({ uid: 't1', name: 'Dr. Rahimov' }, '  Anatomy 3  ');
    expect(group.name).toBe('Anatomy 3');
    expect(group.joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(group.id).not.toBe(group.joinCode);
    expect(store.get(`groups/${group.id}`)).toMatchObject({ ownerId: 't1', joinCode: group.joinCode, joinOpen: true, archived: false });
    expect(store.get(`joinCodes/${group.joinCode}`)).toEqual({ groupId: group.id, active: true });
  });

  it('falls back to a legacy group (id = code) while the old rules are deployed', async () => {
    deniedWrites = path => path.startsWith('joinCodes/');
    const group = await createGroup({ uid: 't1', name: 'x' }, 'Anatomy');
    expect(group.joinCode).toBeUndefined();
    expect(group.id).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(store.get(`groups/${group.id}`)).toMatchObject({ name: 'Anatomy', ownerId: 't1' });
    expect(groupCode(group)).toBe(group.id);
  });

  it('rejects an empty name', async () => {
    await expect(createGroup({ uid: 't1', name: 'x' }, '   ')).rejects.toThrow();
  });
});

describe('migrateLegacyGroup', () => {
  const legacy = { id: 'ABCD2345', name: 'Legacy', ownerId: 't1', createdAt: new Date() } as Group;

  it('keeps the code: joinCode = id, with a joinCodes document', async () => {
    store.set('groups/ABCD2345', { name: 'Legacy', ownerId: 't1' });
    const migrated = await migrateLegacyGroup(legacy);
    expect(migrated.joinCode).toBe('ABCD2345');
    expect(store.get('groups/ABCD2345')).toMatchObject({ joinCode: 'ABCD2345', joinOpen: true, archived: false });
    expect(store.get('joinCodes/ABCD2345')).toEqual({ groupId: 'ABCD2345', active: true });
  });

  it('returns the group unchanged while the old rules are deployed', async () => {
    store.set('groups/ABCD2345', { name: 'Legacy', ownerId: 't1' });
    deniedWrites = () => true;
    expect(await migrateLegacyGroup(legacy)).toBe(legacy);
  });

  it('does nothing for a group that is already current', async () => {
    const current = { ...legacy, joinCode: 'EFGH6789' } as Group;
    expect(await migrateLegacyGroup(current)).toBe(current);
    expect(store.size).toBe(1); // only the seeded user
  });
});

describe('deleteGroupCascade', () => {
  const exam = (id: string, groupIds: string[]) => ({ id, title: id, timeLimit: 10, isPublished: true, groupIds }) as unknown as Exam;

  it('removes members, removal marks, the join code and the group; unpublishes exams of this group only', async () => {
    seedCurrent();
    store.set(`groups/${GID}/members/s1`, { name: 'Aziza' });
    store.set(`groups/${GID}/members/s2`, { name: 'Bakhtiyor' });
    store.set(`groups/${GID}/removed/s3`, { name: 'Camila' });
    store.set('exams/e1', { isPublished: true, groupIds: [GID] });
    store.set('exams/e2', { isPublished: true, groupIds: [GID, 'OTHER000'] });

    const group = { id: GID, name: 'Anatomy', ownerId: 't1', joinCode: CODE, createdAt: new Date() } as Group;
    const result = await deleteGroupCascade(group, [exam('e1', [GID]), exam('e2', [GID, 'OTHER000'])]);

    expect(result).toEqual({ unpublished: 1, detached: 1 });
    expect(Array.from(store.keys()).filter(k => k.startsWith('groups/') || k.startsWith('joinCodes/'))).toEqual([]);
    expect(store.get('exams/e1')).toMatchObject({ isPublished: false, groupIds: [] });
    expect(store.get('exams/e2')).toMatchObject({ isPublished: true, groupIds: ['OTHER000'] });
  });

  it('deletes a legacy group (no join code, old rules that do not know the subcollections)', async () => {
    store.set('groups/ABCD2345', { name: 'Legacy', ownerId: 't1' });
    deniedReads = path => path.startsWith('groups/ABCD2345/');
    const group = { id: 'ABCD2345', name: 'Legacy', ownerId: 't1', createdAt: new Date() } as Group;
    await deleteGroupCascade(group, []);
    expect(store.has('groups/ABCD2345')).toBe(false);
  });

  it('stops before deleting the group when the member list cannot be read for another reason', async () => {
    seedCurrent();
    const group = { id: GID, name: 'Anatomy', ownerId: 't1', joinCode: CODE, createdAt: new Date() } as Group;
    deniedReads = () => { throw new Error('network'); };
    await expect(deleteGroupCascade(group, [])).rejects.toThrow('network');
    expect(store.has(`groups/${GID}`)).toBe(true);
  });
});

describe('teacher tools', () => {
  const current = () => ({ id: GID, name: 'Anatomy', ownerId: 't1', joinCode: CODE, createdAt: new Date() }) as Group;

  it('lists members by name', async () => {
    seedCurrent();
    store.set(`groups/${GID}/members/b`, { name: 'Bakhtiyor' });
    store.set(`groups/${GID}/members/a`, { name: 'Aziza' });
    store.set(`groups/${GID}/members/a/nested/x`, { name: 'not a member' });
    expect((await fetchMembers(GID)).map(m => m.name)).toEqual(['Aziza', 'Bakhtiyor']);
  });

  it('lists nothing (instead of failing) under the old rules', async () => {
    deniedReads = () => true;
    expect(await fetchMembers(GID)).toEqual([]);
    expect(await fetchRemoved(GID)).toEqual([]);
  });

  it('removing a student leaves a mark and deletes the record; restoring deletes the mark', async () => {
    seedCurrent();
    store.set(`groups/${GID}/members/s1`, { name: 'Aziza' });
    await removeMember(GID, { uid: 's1', name: 'Aziza' });
    expect(store.has(`groups/${GID}/members/s1`)).toBe(false);
    expect(store.get(`groups/${GID}/removed/s1`)).toMatchObject({ name: 'Aziza' });
    expect((await fetchRemoved(GID)).map(m => m.uid)).toEqual(['s1']);

    await restoreMember(GID, 's1');
    expect(store.has(`groups/${GID}/removed/s1`)).toBe(false);
  });

  it('rotating the code: new code in, group points at it, old code gone, old code no longer joins', async () => {
    seedCurrent();
    const code = await rotateJoinCode(current());
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(code).not.toBe(CODE);
    expect(store.get(`joinCodes/${code}`)).toEqual({ groupId: GID, active: true });
    expect(store.has(`joinCodes/${CODE}`)).toBe(false);
    expect(store.get(`groups/${GID}`)?.joinCode).toBe(code);

    await expect(joinGroupByCode(student(), CODE)).rejects.toMatchObject({ code: 'not_found' });
    await expect(joinGroupByCode(student(), code)).resolves.toMatchObject({ id: GID });
  });

  it('a group that was never upgraded cannot rotate', async () => {
    await expect(rotateJoinCode({ id: 'ABCD2345', name: 'Legacy', ownerId: 't1', createdAt: new Date() } as Group)).rejects.toThrow();
  });

  it('opens and closes joining', async () => {
    seedCurrent();
    await setGroupJoinOpen(GID, false);
    await expect(joinGroupByCode(student(), CODE)).rejects.toMatchObject({ code: 'closed' });
    await setGroupJoinOpen(GID, true);
    await expect(joinGroupByCode(student(), CODE)).resolves.toMatchObject({ id: GID });
  });

  it('trims and limits name and description, and refuses an empty name', async () => {
    seedCurrent();
    expect(await updateGroupDetails(GID, { name: '  Anatomy 2  ', description: ` ${'x'.repeat(300)} ` }))
      .toEqual({ name: 'Anatomy 2', description: 'x'.repeat(200) });
    await expect(updateGroupDetails(GID, { name: '  ', description: '' })).rejects.toThrow();
  });
});

describe('helpers', () => {
  it('groupCode falls back to the id for legacy groups', () => {
    expect(groupCode({ id: 'ABCD2345' })).toBe('ABCD2345');
    expect(groupCode({ id: 'grpX', joinCode: 'EFGH6789' })).toBe('EFGH6789');
  });

  it('chunk splits a list into parts of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
