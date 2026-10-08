// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTestI18n } from '@/test/i18n';
import AssistantPage from '@/app/dashboard/student/assistant/page';
import { dbNameFor, getQuestions, listBanks, listSessions, openAssistDb, saveSession, type AssistIDB } from './db';
import { buildBank } from './bank';
import { parseBankText } from './parser';
import { buildSession, defaultConfig, seededRng } from './engine';
import { saveBank } from './db';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
let uid = 'u-0';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid } }) }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) }) }));

initTestI18n();

const FILE = `DIF
?Capital of France?
-Rome
+Paris
-Berlin

?Largest planet?
- &Jupiter
-Mars
-Venus

?Capital of France?
-Rome
+Paris
-Berlin
`;

let n = 0;
let check: AssistIDB;

beforeEach(async () => {
  uid = `lib-${++n}`;
  push.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  check = await openAssistDb(uid); // a second connection, to look at what the page stored
});

afterEach(async () => {
  cleanup();
  check.close();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(dbNameFor(uid));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

async function importFile(user: ReturnType<typeof userEvent.setup>, name = 'my_bank.txt', text = FILE) {
  await screen.findByText('No tests yet');
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File([text], name, { type: 'text/plain' }));
  return screen.findByRole('dialog', { name: 'Import tests' });
}

describe('empty library', () => {
  it('explains what to do', async () => {
    render(<AssistantPage />);
    expect(await screen.findByText('No tests yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeTruthy();
  });
});

describe('importing', () => {
  it('previews what was found, removes duplicates, and adds the bank', async () => {
    const user = userEvent.setup();
    render(<AssistantPage />);
    const dialog = await importFile(user);

    const inDialog = within(dialog);
    expect((inDialog.getByLabelText('Name') as HTMLInputElement).value).toBe('my bank');
    expect(inDialog.getByText('Questions found: 3')).toBeTruthy();
    expect(inDialog.getByText('Will be added: 2')).toBeTruthy(); // one duplicate removed
    expect(inDialog.getByText('Duplicates: 1')).toBeTruthy();
    expect(inDialog.getByText(/Line ignored/)).toBeTruthy(); // the "DIF" header

    await user.click(inDialog.getByRole('button', { name: /^Add \(1\)$/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(await screen.findByText('my bank')).toBeTruthy();
    expect(screen.getByText('Questions: 2')).toBeTruthy();
    expect(screen.getByText(/Correct: 0 of 2 \(0\.00%\)/)).toBeTruthy();
    expect(toastSuccess).toHaveBeenCalledWith('Tests added: 1');

    const banks = await listBanks(check);
    expect(banks).toHaveLength(1);
    expect(banks[0]).toMatchObject({ title: 'my bank', questionCount: 2, mode: 'single', sourceName: 'my_bank.txt' });
    const questions = await getQuestions(check, banks[0].id);
    expect(questions[1].options.find(o => o.correct)!.text).toBe('Jupiter'); // the "- &" marker was understood
  });

  it('can keep duplicates when asked', async () => {
    const user = userEvent.setup();
    render(<AssistantPage />);
    const dialog = await importFile(user);
    await user.click(within(dialog).getByLabelText('Remove duplicate questions'));
    expect(within(dialog).getByText('Will be added: 3')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: /^Add/ }));
    await screen.findByText('Questions: 3');
  });

  it('says so when a file holds no questions, and offers nothing to add', async () => {
    const user = userEvent.setup();
    render(<AssistantPage />);
    const dialog = await importFile(user, 'notes.txt', 'just some notes\nnothing here\n');
    expect(within(dialog).getByText(/No usable questions were found/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: /^Add/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('accepts a .qst file the same way', async () => {
    const user = userEvent.setup();
    render(<AssistantPage />);
    const dialog = await importFile(user, 'TEST_QUESTIONS_2026-2027.qst');
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('TEST QUESTIONS 2026-2027');
  });
});

describe('a bank in the list', () => {
  async function withBank() {
    const { bank, questions } = buildBank({ id: 'b1', title: 'Geography', parsed: parseBankText(FILE).questions, now: 1 });
    await saveBank(check, bank, questions);
    return { bank, questions };
  }

  it('opens a menu and starts a training over a chosen range', async () => {
    const user = userEvent.setup();
    await withBank();
    render(<AssistantPage />);
    await user.click(await screen.findByRole('button', { name: /Geography/ }));
    await user.click(screen.getByRole('button', { name: 'Training' }));

    const dialog = await screen.findByRole('dialog', { name: /Start training: Geography/ });
    expect(within(dialog).getByText('Questions: 2')).toBeTruthy();
    await user.click(within(dialog).getByLabelText('Question range'));
    const to = within(dialog).getByLabelText('To');
    await user.clear(to);
    await user.type(to, '1');
    expect(within(dialog).getByText('Questions: 1')).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push.mock.calls[0][0]).toMatch(/^\/dashboard\/student\/assistant\/session\?id=/);

    const sessions = await listSessions(check, 'b1');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ mode: 'training', questionIds: ['b1:1'] });
  });

  it('opens the test in View mode', async () => {
    const user = userEvent.setup();
    await withBank();
    render(<AssistantPage />);
    await user.click(await screen.findByRole('button', { name: /Geography/ }));
    await user.click(screen.getByRole('button', { name: 'View' }));
    expect(push).toHaveBeenCalledWith('/dashboard/student/assistant/bank?id=b1');
  });

  it('refuses a broken range instead of starting', async () => {
    const user = userEvent.setup();
    await withBank();
    render(<AssistantPage />);
    await user.click(await screen.findByRole('button', { name: /Geography/ }));
    await user.click(screen.getByRole('button', { name: 'Exam' }));
    const dialog = await screen.findByRole('dialog', { name: /Start exam/ });
    await user.click(within(dialog).getByLabelText('Question range'));
    const from = within(dialog).getByLabelText('From');
    await user.clear(from);
    await user.type(from, '5');
    expect(within(dialog).getByText(/Check the range: from 1 to 2/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers to continue a session that is still open', async () => {
    const user = userEvent.setup();
    const { bank, questions } = await withBank();
    const session = buildSession({ id: 'open-1', bank, mode: 'exam', questions, progress: new Map(), config: defaultConfig(2), now: Date.now(), rng: seededRng(1) })!;
    await saveSession(check, session);
    render(<AssistantPage />);
    await user.click(await screen.findByRole('button', { name: /Geography/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(push).toHaveBeenCalledWith('/dashboard/student/assistant/session?id=open-1');
  });

  it('renames', async () => {
    const user = userEvent.setup();
    await withBank();
    render(<AssistantPage />);
    await user.click(await screen.findByRole('button', { name: /Geography/ }));
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = await screen.findByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'World capitals');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('World capitals')).toBeTruthy();
    expect((await listBanks(check))[0].title).toBe('World capitals');
  });

  it('asks before deleting, then removes the bank and its data', async () => {
    const user = userEvent.setup();
    await withBank();
    render(<AssistantPage />);
    await user.click(await screen.findByRole('button', { name: /Geography/ }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/will be removed from this device/)).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: 'Delete' }).pop()!;
    await user.click(confirm);
    await screen.findByText('No tests yet');
    expect(await listBanks(check)).toHaveLength(0);
    expect(await getQuestions(check, 'b1')).toHaveLength(0);
  });

  it('exports the questions as text that imports back unchanged', async () => {
    const user = userEvent.setup();
    await withBank();
    let exported: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => ((exported = b), 'blob:test'));
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<AssistantPage />);
    await user.click(await screen.findByRole('button', { name: /Geography/ }));
    await user.click(screen.getByRole('button', { name: /Export/ }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    const text = await (exported as unknown as Blob).text();
    const again = parseBankText(text, { dedupe: false });
    expect(again.questions.map(q => q.text)).toEqual(['Capital of France?', 'Largest planet?']); // the duplicate was not imported
    expect(again.questions[1].options.find(o => o.correct)!.text).toBe('Jupiter');
    click.mockRestore();
  });
});
