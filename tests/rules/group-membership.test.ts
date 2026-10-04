import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { CODE_A, CODE_B, CODE_D, CODE_E, GID, baseCast, currentGroup, examDoc, seed, rulesEnv, userDoc } from './helpers';

const getEnv = rulesEnv();

// teacher1 owns a current group GID with the active code CODE_D; student1 is in legacy group A only.
const modern = { ...baseCast, ...currentGroup(GID, CODE_D, 'teacher1') };

const as = (uid: string) => getEnv().authenticatedContext(uid).firestore();
type Db = ReturnType<typeof as>;

/** What the app does when a student enters a code: the members record and groupIds in ONE batch. */
function join(db: Db, uid: string, gid: string, code: string, record: Record<string, unknown> = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, `groups/${gid}/members/${uid}`), { name: 'Student', code, joinedAt: serverTimestamp(), ...record });
  batch.update(doc(db, `users/${uid}`), { groupIds: arrayUnion(gid) });
  return batch.commit();
}

describe('current groups: joining with a code', () => {
  it('a student joins with the active code (members record + groupIds in one batch)', async () => {
    await seed(getEnv(), modern);
    await assertSucceeds(join(as('student2'), 'student2', GID, CODE_D));
  });

  it('works for the very first group of a brand-new profile (no groupIds field yet)', async () => {
    await seed(getEnv(), { ...modern, 'users/student2': userDoc('student') });
    await assertSucceeds(join(as('student2'), 'student2', GID, CODE_D));
  });

  it('works for a student who is already in another group', async () => {
    await seed(getEnv(), modern);
    await assertSucceeds(join(as('student1'), 'student1', GID, CODE_D));
  });

  it('adding the id to groupIds alone, without a members record, is refused', async () => {
    await seed(getEnv(), modern);
    await assertFails(updateDoc(doc(as('student2'), 'users/student2'), { groupIds: arrayUnion(GID) }));
  });

  it('the group id is not an invitation any more: it is not a code', async () => {
    await seed(getEnv(), modern);
    await assertFails(join(as('student2'), 'student2', GID, GID));
  });

  it('a code that does not exist is refused', async () => {
    await seed(getEnv(), modern);
    await assertFails(join(as('student2'), 'student2', GID, CODE_E));
  });

  it('a code that belongs to another group is refused', async () => {
    await seed(getEnv(), {
      ...modern,
      ...currentGroup('grpPhysio000002', CODE_E, 'teacher2'),
    });
    await assertFails(join(as('student2'), 'student2', GID, CODE_E));
    await assertSucceeds(join(as('student2'), 'student2', 'grpPhysio000002', CODE_E));
  });

  it('a deactivated code is refused', async () => {
    await seed(getEnv(), { ...modern, [`joinCodes/${CODE_D}`]: { groupId: GID, active: false } });
    await assertFails(join(as('student2'), 'student2', GID, CODE_D));
  });

  it('a closed group (joinOpen = false) is refused even with the right code', async () => {
    await seed(getEnv(), { ...modern, ...currentGroup(GID, CODE_D, 'teacher1', { joinOpen: false }) });
    await assertFails(join(as('student2'), 'student2', GID, CODE_D));
  });

  it('a student the owner removed cannot come back with the code', async () => {
    await seed(getEnv(), { ...modern, [`groups/${GID}/removed/student2`]: { name: 'Student', at: new Date() } });
    await assertFails(join(as('student2'), 'student2', GID, CODE_D));
  });

  it('the members record cannot carry extra fields, a foreign uid or a made-up time', async () => {
    await seed(getEnv(), modern);
    await assertFails(join(as('student2'), 'student2', GID, CODE_D, { role: 'owner' }));
    await assertFails(join(as('student2'), 'student2', GID, CODE_D, { joinedAt: new Date('2020-01-01') }));

    const db = as('student2');
    const batch = writeBatch(db);
    batch.set(doc(db, `groups/${GID}/members/student1`), { name: 'Student', code: CODE_D, joinedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  it('joined students can read the exams of the group', async () => {
    await seed(getEnv(), { ...modern, 'exams/e9': examDoc('teacher1', { groupIds: [GID] }) });
    await assertFails(getDoc(doc(as('student2'), 'exams/e9')));
    await assertSucceeds(join(as('student2'), 'student2', GID, CODE_D));
    await assertSucceeds(getDoc(doc(as('student2'), 'exams/e9')));
  });

  it('only one group can be added per write', async () => {
    await seed(getEnv(), { ...modern, ...currentGroup('grpPhysio000002', CODE_E, 'teacher2') });
    const db = as('student2');
    const batch = writeBatch(db);
    batch.set(doc(db, `groups/${GID}/members/student2`), { name: 'S', code: CODE_D, joinedAt: serverTimestamp() });
    batch.set(doc(db, 'groups/grpPhysio000002/members/student2'), { name: 'S', code: CODE_E, joinedAt: serverTimestamp() });
    batch.update(doc(db, 'users/student2'), { groupIds: arrayUnion(GID, 'grpPhysio000002') });
    await assertFails(batch.commit());
  });
});

describe('legacy groups: joining stays as it was, and a members record can be added', () => {
  it('a student still joins a legacy group with the plain groupIds update', async () => {
    await seed(getEnv(), baseCast);
    await assertSucceeds(updateDoc(doc(as('student2'), 'users/student2'), { groupIds: arrayUnion(CODE_A) }));
  });

  it('a legacy join may also write the members record (code = group id)', async () => {
    await seed(getEnv(), baseCast);
    await assertSucceeds(join(as('student2'), 'student2', CODE_A, CODE_A));
  });

  it('an existing legacy member registers the own members record later (lazy)', async () => {
    await seed(getEnv(), baseCast);
    await assertSucceeds(setDoc(doc(as('student1'), `groups/${CODE_A}/members/student1`), {
      name: 'Student', code: CODE_A, joinedAt: serverTimestamp(),
    }));
  });

  it('a stranger cannot write a members record for a legacy group with a wrong code', async () => {
    await seed(getEnv(), baseCast);
    await assertFails(setDoc(doc(as('student2'), `groups/${CODE_A}/members/student2`), {
      name: 'Student', code: CODE_B, joinedAt: serverTimestamp(),
    }));
  });
});

describe('current groups: members, leaving, removing', () => {
  const memberOf = {
    ...modern,
    'users/student2': userDoc('student', { groupIds: [GID] }),
    [`groups/${GID}/members/student2`]: { name: 'Student', code: CODE_D, joinedAt: new Date() },
  };

  it('the member and the owner read the record, another student does not', async () => {
    await seed(getEnv(), memberOf);
    const path = `groups/${GID}/members/student2`;
    await assertSucceeds(getDoc(doc(as('student2'), path)));
    await assertSucceeds(getDoc(doc(as('teacher1'), path)));
    await assertSucceeds(getDoc(doc(as('admin1'), path)));
    await assertFails(getDoc(doc(as('student1'), path)));
    await assertFails(getDoc(doc(as('teacher2'), path)));
  });

  it('only the owner (and the admin) lists the members', async () => {
    await seed(getEnv(), memberOf);
    const path = `groups/${GID}/members`;
    await assertSucceeds(getDocs(collection(as('teacher1'), path)));
    await assertSucceeds(getDocs(collection(as('admin1'), path)));
    await assertFails(getDocs(collection(as('teacher2'), path)));
    await assertFails(getDocs(collection(as('student2'), path)));
  });

  it('a student leaves: members record and groupIds in one batch', async () => {
    await seed(getEnv(), memberOf);
    const db = as('student2');
    const batch = writeBatch(db);
    batch.delete(doc(db, `groups/${GID}/members/student2`));
    batch.update(doc(db, 'users/student2'), { groupIds: arrayRemove(GID) });
    await assertSucceeds(batch.commit());
  });

  it('a member can rename the own record but not change the code or the time', async () => {
    await seed(getEnv(), memberOf);
    const ref = doc(as('student2'), `groups/${GID}/members/student2`);
    await assertSucceeds(updateDoc(ref, { name: 'Aziza R.' }));
    await assertFails(updateDoc(ref, { code: CODE_E }));
    await assertFails(updateDoc(ref, { joinedAt: serverTimestamp() }));
  });

  it('a member who was in the group before the code changed can still register the record', async () => {
    await seed(getEnv(), {
      ...baseCast,
      ...currentGroup(GID, CODE_D, 'teacher1'),
      'users/student2': userDoc('student', { groupIds: [GID] }),
      [`joinCodes/${CODE_D}`]: { groupId: GID, active: false },
    });
    await assertSucceeds(setDoc(doc(as('student2'), `groups/${GID}/members/student2`), {
      name: 'Student', code: CODE_D, joinedAt: serverTimestamp(),
    }));
  });

  it('the owner removes a student: a mark is written and the record deleted', async () => {
    await seed(getEnv(), memberOf);
    const db = as('teacher1');
    const batch = writeBatch(db);
    batch.set(doc(db, `groups/${GID}/removed/student2`), { name: 'Student', at: serverTimestamp() });
    batch.delete(doc(db, `groups/${GID}/members/student2`));
    await assertSucceeds(batch.commit());
  });

  it('another teacher or the student cannot write a removal mark', async () => {
    await seed(getEnv(), memberOf);
    const mark = { name: 'Student', at: serverTimestamp() };
    await assertFails(setDoc(doc(as('teacher2'), `groups/${GID}/removed/student2`), mark));
    await assertFails(setDoc(doc(as('student2'), `groups/${GID}/removed/student2`), mark));
    await assertFails(setDoc(doc(as('student1'), `groups/${GID}/removed/student2`), mark));
    await assertFails(setDoc(doc(as('teacher1'), `groups/${GID}/removed/student2`), { ...mark, at: new Date('2020-01-01') }));
  });

  it('a removed student reads the own mark and drops the group; others cannot read it', async () => {
    await seed(getEnv(), { ...memberOf, [`groups/${GID}/removed/student2`]: { name: 'Student', at: new Date() } });
    const path = `groups/${GID}/removed/student2`;
    await assertSucceeds(getDoc(doc(as('student2'), path)));
    await assertFails(getDoc(doc(as('student1'), path)));
    await assertSucceeds(getDocs(collection(as('teacher1'), `groups/${GID}/removed`)));
    await assertFails(getDocs(collection(as('student2'), `groups/${GID}/removed`)));
    await assertSucceeds(updateDoc(doc(as('student2'), 'users/student2'), { groupIds: arrayRemove(GID) }));
  });

  it('a removed student cannot register a members record again, even while the id is still in groupIds', async () => {
    await seed(getEnv(), {
      ...modern,
      'users/student2': userDoc('student', { groupIds: [GID] }),
      [`groups/${GID}/removed/student2`]: { name: 'Student', at: new Date() },
    });
    await assertFails(setDoc(doc(as('student2'), `groups/${GID}/members/student2`), {
      name: 'Student', code: CODE_D, joinedAt: serverTimestamp(),
    }));
  });

  it('after the owner restores the student (deletes the mark) the code works again', async () => {
    await seed(getEnv(), { ...modern, [`groups/${GID}/removed/student2`]: { name: 'Student', at: new Date() } });
    await assertFails(join(as('student2'), 'student2', GID, CODE_D));
    await assertSucceeds(deleteDoc(doc(as('teacher1'), `groups/${GID}/removed/student2`)));
    await assertSucceeds(join(as('student2'), 'student2', GID, CODE_D));
  });

  it('the owner deletes the whole group with its members and code in one batch', async () => {
    await seed(getEnv(), memberOf);
    const db = as('teacher1');
    const batch = writeBatch(db);
    batch.delete(doc(db, `groups/${GID}/members/student2`));
    batch.delete(doc(db, `joinCodes/${CODE_D}`));
    batch.delete(doc(db, `groups/${GID}`));
    await assertSucceeds(batch.commit());
  });

  it('once the group document is gone its subdocuments can no longer be cleaned up by the owner', async () => {
    // Pins the order the client must follow: members and codes first (or in the same batch as the group).
    await seed(getEnv(), { ...memberOf, 'joinCodes/ZZZZ2222': { groupId: 'gone0000000001', active: true } });
    await assertFails(deleteDoc(doc(as('teacher1'), 'joinCodes/ZZZZ2222')));
  });
});

describe('join codes', () => {
  it('a signed-in user resolves a code, a visitor does not, and nobody lists the codes', async () => {
    await seed(getEnv(), modern);
    await assertSucceeds(getDoc(doc(as('student2'), `joinCodes/${CODE_D}`)));
    await assertFails(getDoc(doc(getEnv().unauthenticatedContext().firestore(), `joinCodes/${CODE_D}`)));
    await assertFails(getDocs(collection(as('teacher1'), 'joinCodes')));
    await assertFails(getDocs(collection(as('admin1'), 'joinCodes')));
  });

  it('the owner rotates the code: new code created, group pointed at it, old code deleted', async () => {
    await seed(getEnv(), modern);
    const db = as('teacher1');
    const batch = writeBatch(db);
    batch.set(doc(db, `joinCodes/${CODE_E}`), { groupId: GID, active: true });
    batch.update(doc(db, `groups/${GID}`), { joinCode: CODE_E, updatedAt: serverTimestamp() });
    batch.delete(doc(db, `joinCodes/${CODE_D}`));
    await assertSucceeds(batch.commit());

    await assertFails(join(as('student2'), 'student2', GID, CODE_D));
    await assertSucceeds(join(as('student2'), 'student2', GID, CODE_E));
  });

  it('a group cannot point at a code that was not written with it', async () => {
    await seed(getEnv(), modern);
    await assertFails(updateDoc(doc(as('teacher1'), `groups/${GID}`), { joinCode: CODE_E }));
  });

  it('a group cannot point at a code that belongs to another group', async () => {
    await seed(getEnv(), { ...modern, ...currentGroup('grpPhysio000002', CODE_E, 'teacher2') });
    await assertFails(updateDoc(doc(as('teacher1'), `groups/${GID}`), { joinCode: CODE_E }));
  });

  it('another teacher cannot create a code that points at somebody else\'s group', async () => {
    await seed(getEnv(), modern);
    await assertFails(setDoc(doc(as('teacher2'), `joinCodes/${CODE_E}`), { groupId: GID, active: true }));
  });

  it('a code that is the id of a legacy group cannot be claimed for another group', async () => {
    // Legacy invitations are the group id; a teacher must not be able to redirect them.
    await seed(getEnv(), { ...baseCast, ...currentGroup('grpPhysio000002', CODE_E, 'teacher2') });
    await assertFails(setDoc(doc(as('teacher2'), `joinCodes/${CODE_A}`), { groupId: 'grpPhysio000002', active: true }));
  });

  it('a student cannot create a code', async () => {
    await seed(getEnv(), modern);
    await assertFails(setDoc(doc(as('student1'), `joinCodes/${CODE_E}`), { groupId: GID, active: true }));
  });

  it('a code must look like a code, point at an existing group, and start active', async () => {
    await seed(getEnv(), modern);
    const db = as('teacher1');
    await assertFails(setDoc(doc(db, 'joinCodes/abcd2345'), { groupId: GID, active: true }));
    await assertFails(setDoc(doc(db, 'joinCodes/ABCD0OIL'), { groupId: GID, active: true }));
    await assertFails(setDoc(doc(db, `joinCodes/${CODE_E}`), { groupId: 'noSuchGroup0001', active: true }));
    await assertFails(setDoc(doc(db, `joinCodes/${CODE_E}`), { groupId: GID, active: false }));
    await assertFails(setDoc(doc(db, `joinCodes/${CODE_E}`), { groupId: GID, active: true, note: 'x' }));
    await assertSucceeds(setDoc(doc(db, `joinCodes/${CODE_E}`), { groupId: GID, active: true }));
  });

  it('the owner switches a code off; nobody else can, and the group cannot be swapped', async () => {
    await seed(getEnv(), modern);
    await assertFails(updateDoc(doc(as('teacher2'), `joinCodes/${CODE_D}`), { active: false }));
    await assertFails(updateDoc(doc(as('student1'), `joinCodes/${CODE_D}`), { active: false }));
    await assertFails(updateDoc(doc(as('teacher1'), `joinCodes/${CODE_D}`), { groupId: 'grpPhysio000002' }));
    await assertSucceeds(updateDoc(doc(as('teacher1'), `joinCodes/${CODE_D}`), { active: false }));
    await assertFails(join(as('student2'), 'student2', GID, CODE_D));
  });

  it('only the owner (or the admin) deletes a code', async () => {
    await seed(getEnv(), modern);
    await assertFails(deleteDoc(doc(as('teacher2'), `joinCodes/${CODE_D}`)));
    await assertFails(deleteDoc(doc(as('student1'), `joinCodes/${CODE_D}`)));
    await assertSucceeds(deleteDoc(doc(as('teacher1'), `joinCodes/${CODE_D}`)));
  });
});

describe('current groups: creating and editing', () => {
  const fresh = (ownerId: string, code: string) => ({
    name: 'Physiology', ownerId, ownerName: 'Owner', joinCode: code, joinOpen: true, archived: false, createdAt: serverTimestamp(),
  });

  it('a teacher creates a group and its join code in one batch', async () => {
    await seed(getEnv(), baseCast);
    const db = as('teacher1');
    const batch = writeBatch(db);
    batch.set(doc(db, 'groups/Xk3mPq9RzT2vLw8NaB4c'), fresh('teacher1', CODE_E));
    batch.set(doc(db, `joinCodes/${CODE_E}`), { groupId: 'Xk3mPq9RzT2vLw8NaB4c', active: true });
    await assertSucceeds(batch.commit());
  });

  it('a group that names a code without writing it is refused', async () => {
    await seed(getEnv(), baseCast);
    await assertFails(setDoc(doc(as('teacher1'), 'groups/Xk3mPq9RzT2vLw8NaB4c'), fresh('teacher1', CODE_E)));
  });

  it('a new group cannot take over a code that already belongs to another group', async () => {
    await seed(getEnv(), { ...modern });
    const db = as('teacher2');
    const batch = writeBatch(db);
    batch.set(doc(db, 'groups/Xk3mPq9RzT2vLw8NaB4c'), fresh('teacher2', CODE_D));
    batch.set(doc(db, `joinCodes/${CODE_D}`), { groupId: 'Xk3mPq9RzT2vLw8NaB4c', active: true });
    await assertFails(batch.commit());
  });

  it('the owner edits name, description and joinOpen; the owner cannot change the owner', async () => {
    await seed(getEnv(), modern);
    const ref = doc(as('teacher1'), `groups/${GID}`);
    await assertSucceeds(updateDoc(ref, { name: 'Anatomy 2', description: 'Autumn', joinOpen: false, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { ownerId: 'teacher2' }));
    await assertFails(updateDoc(ref, { joinOpen: 'no' }));
    await assertFails(updateDoc(ref, { description: 'x'.repeat(201) }));
  });
});

describe('legacy groups: migration to a current group by the owner', () => {
  // The group keeps its id and its code stays the same (joinCode = id), so printed links and QR codes keep working.
  async function migrate(uid: string, gid: string) {
    const db = as(uid);
    const batch = writeBatch(db);
    batch.set(doc(db, `joinCodes/${gid}`), { groupId: gid, active: true });
    batch.update(doc(db, `groups/${gid}`), { joinCode: gid, joinOpen: true, archived: false, updatedAt: serverTimestamp() });
    return batch.commit();
  }

  it('the owner migrates a legacy group in one batch', async () => {
    await seed(getEnv(), baseCast);
    await assertSucceeds(migrate('teacher1', CODE_A));
  });

  it('another teacher cannot migrate it', async () => {
    await seed(getEnv(), baseCast);
    await assertFails(migrate('teacher2', CODE_A));
  });

  it('afterwards a plain groupIds update no longer joins; the batch with the code does', async () => {
    await seed(getEnv(), baseCast);
    await migrate('teacher1', CODE_A);
    await assertFails(updateDoc(doc(as('student2'), 'users/student2'), { groupIds: arrayUnion(CODE_A) }));
    await assertSucceeds(join(as('student2'), 'student2', CODE_A, CODE_A));
  });

  it('afterwards an existing member still keeps access and can register the record', async () => {
    await seed(getEnv(), { ...baseCast, 'exams/e1': examDoc('teacher1') });
    await migrate('teacher1', CODE_A);
    await assertSucceeds(getDoc(doc(as('student1'), 'exams/e1')));
    await assertSucceeds(setDoc(doc(as('student1'), `groups/${CODE_A}/members/student1`), {
      name: 'Student', code: CODE_A, joinedAt: serverTimestamp(),
    }));
  });

  it('a group that is only half migrated (code written, group not pointing at it) is still safe', async () => {
    await seed(getEnv(), { ...baseCast, [`joinCodes/${CODE_A}`]: { groupId: CODE_A, active: true } });
    // The group still has no joinCode field: it is legacy, the old plain join works.
    await assertSucceeds(updateDoc(doc(as('student2'), 'users/student2'), { groupIds: arrayUnion(CODE_A) }));
  });
});
