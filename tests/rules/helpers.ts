import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, setLogLevel } from 'firebase/firestore';

export const PROJECT_ID = 'demo-active-study';

// The tests refuse writes on purpose; the SDK would print every refusal as an error.
setLogLevel('silent');

// Valid join codes: 8 characters from ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I, L, O, 0, 1).
export const CODE_A = 'ABCD2345';
export const CODE_B = 'EFGH6789';
export const CODE_C = 'JKMN2345';
export const CODE_D = 'QRST2345';
export const CODE_E = 'WXYZ6789';

// A "current" group: the id is NOT the join code, the code lives in joinCodes/{code}.
export const GID = 'grpAnatomy0001';

export type Role = 'student' | 'teacher' | 'admin';

/** Starts one rules environment per test file and wipes the database before every test. */
export function rulesEnv(): () => RulesTestEnvironment {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      // Host and port come from FIRESTORE_EMULATOR_HOST, which `firebase emulators:exec` sets.
      firestore: { rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8') },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  return () => env;
}

/** Writes documents with the rules switched off: the starting state of a test. */
export async function seed(env: RulesTestEnvironment, docs: Record<string, Record<string, unknown>>): Promise<void> {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [path, data] of Object.entries(docs)) {
      await setDoc(doc(db, path), data);
    }
  });
}

export function userDoc(role: Role, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { role, displayName: `${role} user`, email: '', ...extra };
}

export function groupDoc(ownerId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'Anatomy', ownerId, ownerName: 'Owner', ...extra };
}

export function examDoc(createdBy: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Exam',
    timeLimit: 30,
    isPublished: true,
    visibility: 'listed',
    createdBy,
    groupIds: [CODE_A],
    ...extra,
  };
}

/** The usual cast: two teachers, two students (only student1 is in group A), one admin, and group A owned by teacher1. */
export const baseCast: Record<string, Record<string, unknown>> = {
  'users/teacher1': userDoc('teacher'),
  'users/teacher2': userDoc('teacher'),
  'users/student1': userDoc('student', { groupIds: [CODE_A] }),
  'users/student2': userDoc('student', { groupIds: [] }),
  'users/admin1': userDoc('admin'),
  [`groups/${CODE_A}`]: groupDoc('teacher1'),
};

/** Seed entries for a current group: the group document plus its active join code. */
export function currentGroup(
  gid: string,
  code: string,
  ownerId: string,
  extra: Record<string, unknown> = {},
): Record<string, Record<string, unknown>> {
  return {
    [`groups/${gid}`]: groupDoc(ownerId, { joinCode: code, joinOpen: true, archived: false, ...extra }),
    [`joinCodes/${code}`]: { groupId: gid, active: true },
  };
}
