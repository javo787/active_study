// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTestI18n } from '@/test/i18n';
import SessionView from './SessionView';
import { buildBank } from '../bank';
import { parseBankText } from '../parser';
import { buildSession, defaultConfig, seededRng } from '../engine';
import { dbNameFor, getProgress, listSessions, openAssistDb, saveBank, saveSession, getSession, type AssistIDB } from '../db';
import type { AssistBank, AssistQuestion, AssistSession, SessionConfig, SessionMode } from '../types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

initTestI18n();

const BANK = `?Capital of France?
-Rome
+Paris
-Berlin

?Largest planet?
+Jupiter
-Mars
-Venus

?Pick the primes
+Two
-Four
+Three
-Six
`;

let db: AssistIDB;
let uid: string;
let n = 0;
let bank: AssistBank;
let questions: AssistQuestion[];

const config = (over: Partial<SessionConfig> = {}): SessionConfig => ({
  ...defaultConfig(3),
  shuffleQuestions: false,
  shuffleAnswers: false,
  ...over,
});

async function makeSession(mode: SessionMode, over: Partial<SessionConfig> = {}, patch: Partial<AssistSession> = {}) {
  const session = {
    ...buildSession({ id: `s-${mode}`, bank, mode, questions, progress: new Map(), config: config(over), now: Date.now(), rng: seededRng(1) })!,
    ...patch,
  };
  await saveSession(db, session);
  return session;
}

function view(session: AssistSession, progress = new Map()) {
  return render(<SessionView db={db} bank={bank} initial={session} questions={questions} initialProgress={progress} />);
}

beforeEach(async () => {
  push.mockClear();
  uid = `u-${++n}`;
  db = await openAssistDb(uid);
  const built = buildBank({ id: 'b1', title: 'Geography', parsed: parseBankText(BANK).questions, now: 1 });
  bank = built.bank;
  questions = built.questions;
  await saveBank(db, bank, questions);
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  db.close();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(dbNameFor(uid));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('training', () => {
  it('checks each answer, shows feedback, records progress and ends with a result', async () => {
    const user = userEvent.setup();
    view(await makeSession('training'));

    expect(screen.getByText('Question 1 of 3')).toBeTruthy();
    const check = screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement;
    expect(check.disabled).toBe(true); // nothing selected yet

    await user.click(screen.getByLabelText('Rome')); // wrong
    expect(check.disabled).toBe(false);
    await user.click(check);
    expect(screen.getByRole('status').textContent).toBe('Wrong');
    expect(screen.getByLabelText(/Paris/).closest('label')!.className).toContain('emerald'); // the right one is shown

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Question 2 of 3')).toBeTruthy();
    await user.click(screen.getByLabelText('Jupiter'));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status').textContent).toBe('Correct!');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Select 2 answers/)).toBeTruthy(); // a multiple-choice question says how many
    await user.click(screen.getByLabelText('Two'));
    await user.click(screen.getByLabelText('Three'));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status').textContent).toBe('Correct!');

    // All answered: "Finish" ends the training at once, without asking.
    await user.click(screen.getAllByRole('button', { name: 'Finish' }).pop()!);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Result' })).toBeTruthy());
    expect(screen.getByText('66.7%')).toBeTruthy();

    const progress = await getProgress(db, 'b1');
    expect(progress.get('b1:1')).toMatchObject({ status: 'wrong', attempts: 1 });
    expect(progress.get('b1:2')).toMatchObject({ status: 'correct' });
    expect(progress.get('b1:3')).toMatchObject({ status: 'correct' });
    expect((await getSession(db, 's-training'))!.endedAt).toBeTruthy();
  });

  it('for a multiple-choice question one right option is not enough', async () => {
    const user = userEvent.setup();
    view(await makeSession('training', { scope: 'range', rangeFrom: 3, rangeTo: 3 }));
    await user.click(screen.getByLabelText('Two'));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status').textContent).toBe('Wrong');
    expect((await getProgress(db, 'b1')).get('b1:3')!.status).toBe('wrong');
  });

  it('locks the answer after checking', async () => {
    const user = userEvent.setup();
    view(await makeSession('training'));
    await user.click(screen.getByLabelText('Rome'));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect((screen.getByLabelText(/Rome/) as HTMLInputElement).disabled).toBe(true);
  });

  it('marks a favourite and keeps it', async () => {
    const user = userEvent.setup();
    view(await makeSession('training'));
    await user.click(screen.getByRole('button', { name: 'Add to favourites' }));
    expect(screen.getByRole('button', { name: 'Remove from favourites' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(async () => expect((await getProgress(db, 'b1')).get('b1:1')?.starred).toBe(true));
  });

  it('resumes at the first question that is not done', async () => {
    const base = await makeSession('training');
    view({ ...base, answers: { 'b1:1': ['b1:1:1'] }, checked: { 'b1:1': true } });
    expect(screen.getByText('Question 2 of 3')).toBeTruthy();
  });
});

describe('exam', () => {
  it('gives no feedback while answering, asks before leaving questions blank, then records everything', async () => {
    const user = userEvent.setup();
    view(await makeSession('exam'));

    await user.click(screen.getByLabelText('Paris')); // right
    expect(screen.queryByRole('status')).toBeNull(); // no feedback in an exam
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByLabelText('Mars')); // wrong
    // question 3 stays blank

    await user.click(screen.getAllByRole('button', { name: 'Finish' })[0]);
    expect(screen.getByText(/Unanswered questions: 1/)).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Finish' }).pop()!); // the dialog's confirm button

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Result' })).toBeTruthy());
    expect(screen.getByText('33.3%')).toBeTruthy();
    expect(screen.getByText('Correct: 1')).toBeTruthy();
    expect(screen.getByText('Wrong: 1')).toBeTruthy();
    expect(screen.getByText('Unanswered: 1')).toBeTruthy();

    const progress = await getProgress(db, 'b1');
    expect(progress.get('b1:1')!.status).toBe('correct');
    expect(progress.get('b1:2')!.status).toBe('wrong');
    expect(progress.has('b1:3')).toBe(false); // never answered: untouched
  });

  it('can change an answer before finishing', async () => {
    const user = userEvent.setup();
    view(await makeSession('exam', { scope: 'range', rangeFrom: 1, rangeTo: 1 }));
    await user.click(screen.getByLabelText('Rome'));
    await user.click(screen.getByLabelText('Paris'));
    expect((screen.getByLabelText('Paris') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Rome') as HTMLInputElement).checked).toBe(false);
  });

  it('the result offers a review and a retry of the mistakes, as a new training session', async () => {
    const user = userEvent.setup();
    view(await makeSession('exam'));
    await user.click(screen.getByLabelText('Rome')); // wrong
    await user.click(screen.getAllByRole('button', { name: 'Finish' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Finish' }).pop()!);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Result' })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /Review mistakes/ }));
    expect(screen.getAllByText('Rome').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Retry mistakes \(1\)/ }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push.mock.calls[0][0]).toMatch(/^\/dashboard\/student\/assistant\/session\?id=/);

    const sessions = await listSessions(db, 'b1');
    const retry = sessions.find(s => s.id !== 's-exam')!;
    expect(retry).toMatchObject({ mode: 'training', questionIds: ['b1:1'] });
    expect(retry.endedAt).toBeUndefined();
  });
});

describe('time limit', () => {
  it('ends the session by itself when the time is up', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const session = await makeSession('exam', { timeLimitMin: 1 }, { deadline: Date.now() + 2500 });
    view(session);
    expect(screen.getByRole('timer').textContent).toBe('0:02');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Result' })).toBeTruthy());
    const saved = (await getSession(db, 's-exam'))!;
    expect(saved.endedAt).toBeLessThanOrEqual(saved.deadline!);
  });
});
