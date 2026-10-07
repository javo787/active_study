import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBank, titleFromFileName } from './bank';
import { parseBankText } from './parser';
import {
  dbNameFor,
  deleteBank,
  getAllProgress,
  getBank,
  getOpenSession,
  getProgress,
  getQuestions,
  listBanks,
  listSessions,
  openAssistDb,
  putProgress,
  renameBank,
  saveBank,
  saveSession,
  type AssistIDB,
} from './db';
import { buildSession, defaultConfig, recordAnswer, seededRng } from './engine';
import type { AssistSession } from './types';

const SAMPLE = '?Capital of France?\n-Rome\n+Paris\n-Berlin\n\n?Primes\n+2\n+3\n-4\n';
let db: AssistIDB;
let uid: string;
let n = 0;

beforeEach(async () => {
  uid = `user-${++n}`;
  db = await openAssistDb(uid);
});

afterEach(async () => {
  db.close();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(dbNameFor(uid));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

async function addBank(title = 'Sample', text = SAMPLE, now = 1000) {
  const { bank, questions } = buildBank({ title, parsed: parseBankText(text).questions, now });
  await saveBank(db, bank, questions);
  return { bank, questions };
}

describe('buildBank', () => {
  it('numbers questions from 1, derives unique ids and the bank mode', () => {
    const { bank, questions } = buildBank({ id: 'B', title: ' Sample ', parsed: parseBankText(SAMPLE).questions, now: 5 });
    expect(bank).toMatchObject({ id: 'B', title: 'Sample', questionCount: 2, mode: 'mixed', createdAt: 5, updatedAt: 5 });
    expect(questions.map(q => q.id)).toEqual(['B:1', 'B:2']);
    expect(questions.map(q => q.index)).toEqual([1, 2]);
    expect(questions[1].options.map(o => o.id)).toEqual(['B:2:0', 'B:2:1', 'B:2:2']);
    expect(new Set(questions.flatMap(q => q.options.map(o => o.id))).size).toBe(6);
  });

  it('makes a readable title from a file name', () => {
    expect(titleFromFileName('TEST_QUESTIONS_2026-2027.qst')).toBe('TEST QUESTIONS 2026-2027');
    expect(titleFromFileName('тести_англис_барои_курси_5.txt')).toBe('тести англис барои курси 5');
    expect(titleFromFileName('.txt')).toBe('Untitled');
  });
});

describe('banks', () => {
  it('saves and reads back a bank with its questions in order', async () => {
    const { bank } = await addBank();
    expect(await getBank(db, bank.id)).toMatchObject({ title: 'Sample', questionCount: 2 });
    const qs = await getQuestions(db, bank.id);
    expect(qs.map(q => q.text)).toEqual(['Capital of France?', 'Primes']);
    expect(qs[1].options.filter(o => o.correct)).toHaveLength(2);
  });

  it('lists the most recently updated bank first', async () => {
    const a = await addBank('A', SAMPLE, 100);
    const b = await addBank('B', SAMPLE, 300);
    const c = await addBank('C', SAMPLE, 200);
    expect((await listBanks(db)).map(x => x.id)).toEqual([b.bank.id, c.bank.id, a.bank.id]);
  });

  it('renames, ignoring an empty title', async () => {
    const { bank } = await addBank();
    await renameBank(db, bank.id, '  New name ', 2000);
    expect(await getBank(db, bank.id)).toMatchObject({ title: 'New name', updatedAt: 2000 });
    await renameBank(db, bank.id, '   ', 3000);
    expect((await getBank(db, bank.id))!.title).toBe('New name');
  });

  it('keeps the questions of different banks apart', async () => {
    const a = await addBank('A');
    const b = await addBank('B', '?Only\n+x\n-y\n');
    expect(await getQuestions(db, a.bank.id)).toHaveLength(2);
    expect(await getQuestions(db, b.bank.id)).toHaveLength(1);
  });
});

describe('deleting a bank removes everything that belongs to it, and only that', () => {
  it('questions, progress and sessions', async () => {
    const a = await addBank('A');
    const b = await addBank('B');
    for (const x of [a, b]) {
      await putProgress(db, [recordAnswer(undefined, x.bank.id, x.questions[0].id, true, 1)]);
      const s = buildSession({ id: `s-${x.bank.id}`, bank: x.bank, mode: 'training', questions: x.questions, progress: new Map(), config: defaultConfig(2), now: 1, rng: seededRng(1) })!;
      await saveSession(db, s);
    }

    await deleteBank(db, a.bank.id);

    expect(await getBank(db, a.bank.id)).toBeUndefined();
    expect(await getQuestions(db, a.bank.id)).toHaveLength(0);
    expect((await getProgress(db, a.bank.id)).size).toBe(0);
    expect(await listSessions(db, a.bank.id)).toHaveLength(0);

    expect(await getBank(db, b.bank.id)).toBeDefined();
    expect(await getQuestions(db, b.bank.id)).toHaveLength(2);
    expect((await getProgress(db, b.bank.id)).size).toBe(1);
    expect(await listSessions(db, b.bank.id)).toHaveLength(1);
  });
});

describe('progress', () => {
  it('is stored per question and read back as a map', async () => {
    const { bank, questions } = await addBank();
    await putProgress(db, [
      recordAnswer(undefined, bank.id, questions[0].id, true, 10),
      recordAnswer(undefined, bank.id, questions[1].id, false, 11),
    ]);
    const map = await getProgress(db, bank.id);
    expect(map.get(questions[0].id)).toMatchObject({ status: 'correct', attempts: 1 });
    expect(map.get(questions[1].id)).toMatchObject({ status: 'wrong' });
    expect((await getAllProgress(db)).size).toBe(2);
  });

  it('updates in place', async () => {
    const { bank, questions } = await addBank();
    const first = recordAnswer(undefined, bank.id, questions[0].id, false, 1);
    await putProgress(db, [first]);
    await putProgress(db, [recordAnswer(first, bank.id, questions[0].id, true, 2)]);
    const p = (await getProgress(db, bank.id)).get(questions[0].id)!;
    expect(p).toMatchObject({ status: 'correct', attempts: 2, wrong: 1, correct: 1 });
  });

  it('putProgress with nothing is a no-op', async () => {
    await expect(putProgress(db, [])).resolves.toBeUndefined();
  });
});

describe('sessions', () => {
  async function session(id: string, over: Partial<AssistSession> = {}) {
    const { bank, questions } = await addBank(`B-${id}`);
    const s = buildSession({ id, bank, mode: 'training', questions, progress: new Map(), config: defaultConfig(2), now: 100, rng: seededRng(1) })!;
    return { bank, s: { ...s, ...over } };
  }

  it('finds the running session of a bank', async () => {
    const { bank, s } = await session('s1');
    await saveSession(db, s);
    expect((await getOpenSession(db, bank.id, 200))?.id).toBe('s1');
  });

  it('does not offer an ended session', async () => {
    const { bank, s } = await session('s1', { endedAt: 150 });
    await saveSession(db, s);
    expect(await getOpenSession(db, bank.id, 200)).toBeUndefined();
  });

  it('does not offer a session whose time ran out', async () => {
    const { bank, s } = await session('s1', { deadline: 150 });
    await saveSession(db, s);
    expect(await getOpenSession(db, bank.id, 200)).toBeUndefined();
    expect((await getOpenSession(db, bank.id, 149))?.id).toBe('s1');
  });

  it('keeps saved answers across a reopen of the database (a reload of the page)', async () => {
    const { s } = await session('s1');
    await saveSession(db, { ...s, answers: { [s.questionIds[0]]: ['x'] } });
    db.close();
    db = await openAssistDb(uid);
    const again = (await db.get('sessions', 's1'))!;
    expect(again.answers).toEqual({ [s.questionIds[0]]: ['x'] });
  });
});

describe('separate users on one device', () => {
  it('never see each other\'s banks', async () => {
    await addBank('Mine');
    const other = await openAssistDb(`${uid}-other`);
    expect(await listBanks(other)).toHaveLength(0);
    other.close();
    await new Promise<void>(resolve => {
      const req = indexedDB.deleteDatabase(dbNameFor(`${uid}-other`));
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
