// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTestI18n } from '@/test/i18n';
import ViewScreen, { CHUNK } from './ViewScreen';
import BankLoader from '@/app/dashboard/student/assistant/bank/BankLoader';
import { buildBank } from '../bank';
import { parseBankText } from '../parser';
import { dbNameFor, getProgress, openAssistDb, putProgress, saveBank, type AssistIDB } from '../db';
import { recordAnswer } from '../engine';
import type { AssistBank, AssistQuestion } from '../types';

const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { error: (...a: unknown[]) => toastError(...a), success: vi.fn() }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParams),
}));
let searchParams = '';
let uid = 'v-0';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid } }) }));

initTestI18n();

// 100 generic questions, then three that the search tests look for.
function bankText(): string {
  const lines: string[] = [];
  for (let i = 1; i <= 100; i++) lines.push(`?Generic question number ${i}`, `+right ${i}`, `-wrong ${i}`, '');
  lines.push('?Пойтахти Тоҷикистон кадом аст?', '+Душанбе', '-Хуҷанд', '');
  lines.push('?Capital of France?', '+Paris', '-Rome', '');
  lines.push('?Pick the primes', '+Two', '+Three', '-Four', '');
  return lines.join('\n');
}

let db: AssistIDB;
let bank: AssistBank;
let questions: AssistQuestion[];
let n = 0;

const cards = () => screen.getAllByRole('listitem').filter(li => li.id.startsWith('q-'));

beforeEach(async () => {
  uid = `view-${++n}`;
  toastError.mockClear();
  db = await openAssistDb(uid);
  const built = buildBank({ id: 'b1', title: 'Big bank', sourceName: 'big.txt', parsed: parseBankText(bankText(), { dedupe: false }).questions, now: Date.UTC(2026, 9, 7) });
  bank = built.bank;
  questions = built.questions;
  await saveBank(db, bank, questions);
});

afterEach(async () => {
  cleanup();
  db.close();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(dbNameFor(uid));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

const view = (progress = new Map()) => render(<ViewScreen db={db} bank={bank} questions={questions} initialProgress={progress} />);

describe('the list', () => {
  it('draws the questions in portions, with a button for the next portion', async () => {
    const user = userEvent.setup();
    view();
    expect(screen.getByText('Showing 103 of 103')).toBeTruthy();
    expect(cards()).toHaveLength(CHUNK);
    await user.click(screen.getByRole('button', { name: /Show more \(63\)/ }));
    expect(cards()).toHaveLength(CHUNK * 2);
  });

  it('highlights the right answers with colour, an icon and text for screen readers', () => {
    view();
    const card = document.getElementById('q-1')!;
    const right = within(card).getByText('right 1').closest('li')!;
    const wrong = within(card).getByText('wrong 1').closest('li')!;
    expect(right.className).toContain('emerald');
    expect(wrong.className).not.toContain('emerald');
    expect(within(right).getByText(/Right answer/)).toBeTruthy();
  });

  it('can hide the answers, to read the questions and think first', async () => {
    const user = userEvent.setup();
    view();
    const toggle = screen.getByRole('button', { name: 'Answers: shown' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await user.click(toggle);
    const hidden = screen.getByRole('button', { name: 'Answers: hidden' });
    expect(hidden.getAttribute('aria-pressed')).toBe('false');
    const card = document.getElementById('q-1')!;
    expect(within(card).getByText('right 1').closest('li')!.className).not.toContain('emerald');
    expect(within(card).queryByText(/Right answer/)).toBeNull();
  });

  it('shows how the student did on each question', () => {
    const progress = new Map([
      ['b1:1', recordAnswer(recordAnswer(undefined, 'b1', 'b1:1', false, 1), 'b1', 'b1:1', true, 2)],
    ]);
    view(progress);
    const card = document.getElementById('q-1')!;
    expect(within(card).getByText('Correct')).toBeTruthy();
    expect(within(card).getByText('Attempts: 2, correct: 1')).toBeTruthy();
    expect(within(document.getElementById('q-2')!).getByText('Unanswered')).toBeTruthy();
  });
});

describe('search', () => {
  it('narrows the list as you type and marks the match', async () => {
    const user = userEvent.setup();
    view();
    await user.type(screen.getByRole('searchbox'), 'capital');
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(screen.getByText('Showing 1 of 103')).toBeTruthy();
    expect(document.querySelector('mark')!.textContent).toBe('Capital');
  });

  it('finds Tajik text typed with Russian letters', async () => {
    const user = userEvent.setup();
    view();
    await user.type(screen.getByRole('searchbox'), 'точикистон');
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(within(cards()[0]).getByText(/кадом аст/)).toBeTruthy();
    expect(document.querySelector('mark')!.textContent).toBe('Тоҷикистон');
  });

  it('finds a question by number', async () => {
    const user = userEvent.setup();
    view();
    await user.type(screen.getByRole('searchbox'), '#77');
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0].id).toBe('q-77');
  });

  it('says so when nothing matches, and the button brings everything back', async () => {
    const user = userEvent.setup();
    view();
    await user.type(screen.getByRole('searchbox'), 'zzzzqq');
    expect(await screen.findByText('Nothing found')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    await waitFor(() => expect(cards()).toHaveLength(CHUNK));
  });

  it('has a clear button', async () => {
    const user = userEvent.setup();
    view();
    await user.type(screen.getByRole('searchbox'), 'paris');
    await waitFor(() => expect(cards()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(cards()).toHaveLength(CHUNK));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
});

describe('filters', () => {
  const seeded = () =>
    new Map([
      ['b1:1', recordAnswer(undefined, 'b1', 'b1:1', false, 1)],
      ['b1:2', recordAnswer(undefined, 'b1', 'b1:2', false, 1)],
      ['b1:3', recordAnswer(undefined, 'b1', 'b1:3', true, 1)],
      ['b1:4', { ...recordAnswer(undefined, 'b1', 'b1:4', true, 1), starred: true }],
    ]);

  it('shows only mistakes, with counts in the dialog', async () => {
    const user = userEvent.setup();
    view(seeded());
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const dialog = screen.getByRole('dialog', { name: 'Which questions to show' });
    expect(within(dialog).getByLabelText(/^Mistake/).closest('label')!.textContent).toContain('2'); // two mistakes
    await user.click(within(dialog).getByLabelText(/^Mistake/));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(cards().map(c => c.id)).toEqual(['q-1', 'q-2']);
    expect(screen.getByRole('button', { name: /^Filter/ }).textContent).toContain('1'); // one filter active
  });

  it('ticked options are alternatives: mistakes or favourites', async () => {
    const user = userEvent.setup();
    view(seeded());
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/^Mistake/));
    await user.click(within(dialog).getByLabelText(/^Favourites/));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(cards().map(c => c.id)).toEqual(['q-1', 'q-2', 'q-4']);
  });

  it('reset clears the filters', async () => {
    const user = userEvent.setup();
    view(seeded());
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/^Correct/));
    expect(cards()).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }));
    expect(cards()).toHaveLength(CHUNK);
  });

  it('combines with the search', async () => {
    const user = userEvent.setup();
    view(seeded());
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(within(screen.getByRole('dialog')).getByLabelText(/^Mistake/));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    await user.type(screen.getByRole('searchbox'), 'number 2');
    await waitFor(() => expect(cards().map(c => c.id)).toEqual(['q-2']));
  });
});

describe('favourites', () => {
  it('toggles a heart and stores it', async () => {
    const user = userEvent.setup();
    view();
    const card = document.getElementById('q-5')!;
    await user.click(within(card).getByRole('button', { name: 'Add to favourites' }));
    expect(within(card).getByRole('button', { name: 'Remove from favourites' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(async () => expect((await getProgress(db, 'b1')).get('b1:5')?.starred).toBe(true));

    await user.click(within(card).getByRole('button', { name: 'Remove from favourites' }));
    await waitFor(async () => expect((await getProgress(db, 'b1')).get('b1:5')?.starred).toBe(false));
  });

  it('keeps the earlier result when a heart is added to an answered question', async () => {
    const user = userEvent.setup();
    const answered = recordAnswer(undefined, 'b1', 'b1:6', false, 5);
    await putProgress(db, [answered]);
    view(new Map([['b1:6', answered]]));
    await user.click(within(document.getElementById('q-6')!).getByRole('button', { name: 'Add to favourites' }));
    await waitFor(async () => expect((await getProgress(db, 'b1')).get('b1:6')).toMatchObject({ starred: true, status: 'wrong', attempts: 1 }));
  });
});

describe('go to a question number', () => {
  it('draws far enough to include it and scrolls to it', async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    view();
    expect(document.getElementById('q-95')).toBeNull();
    await user.type(screen.getByLabelText('Go to #'), '95');
    await user.click(screen.getByRole('button', { name: 'Go' }));
    await waitFor(() => expect(document.getElementById('q-95')).not.toBeNull());
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });

  it('says so when that question is hidden by the search or filters', async () => {
    const user = userEvent.setup();
    view();
    await user.type(screen.getByRole('searchbox'), 'paris');
    await waitFor(() => expect(cards()).toHaveLength(1));
    await user.type(screen.getByLabelText('Go to #'), '3');
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(toastError).toHaveBeenCalledWith('Question #3 is not in the current list. Check the search and filters.');
  });
});

describe('info', () => {
  it('shows the test, its source and the progress', async () => {
    const user = userEvent.setup();
    const progress = new Map([
      ['b1:1', recordAnswer(undefined, 'b1', 'b1:1', true, 1)],
      ['b1:2', recordAnswer(undefined, 'b1', 'b1:2', false, 1)],
    ]);
    view(progress);
    await user.click(screen.getByRole('button', { name: 'Info' }));
    const dialog = screen.getByRole('dialog', { name: 'About this test' });
    expect(within(dialog).getByText('big.txt')).toBeTruthy();
    expect(within(dialog).getByText('Correct: 1 of 103 (0.97%)')).toBeTruthy();
    expect(within(dialog).getByText('With a mistake: 1')).toBeTruthy();
    expect(within(dialog).getByText('Unanswered: 101')).toBeTruthy();
    expect(within(dialog).getByText('Mixed')).toBeTruthy();
  });
});

describe('loading a bank from the address', () => {
  it('opens the bank with the id in the address', async () => {
    searchParams = 'id=b1';
    render(<BankLoader />);
    expect(await screen.findByRole('heading', { name: 'Big bank' })).toBeTruthy();
    expect(cards()).toHaveLength(CHUNK);
  });

  it('says so for an id that does not exist, or no id at all', async () => {
    searchParams = 'id=nope';
    const first = render(<BankLoader />);
    expect(await screen.findByText(/Test not found/)).toBeTruthy();
    first.unmount();
    searchParams = '';
    render(<BankLoader />);
    expect(await screen.findByText(/Test not found/)).toBeTruthy();
  });
});
