// Pure logic of the Assistant: choosing questions, building a session, checking answers, scoring.
// No storage, no React and no clock of its own (time and randomness are passed in), so it is fully testable.

import type {
  AssistBank,
  AssistQuestion,
  AssistSession,
  BankMode,
  BankStats,
  QuestionProgress,
  SessionConfig,
  SessionMode,
  SessionSummary,
} from './types';

export type Rng = () => number;

/** Small seeded generator (mulberry32): the same seed gives the same shuffle, which makes tests exact. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const TIME_LIMITS_MIN = [10, 20, 30, 45, 60, 90, 120] as const;
export const RANDOM_COUNTS = [10, 20, 30, 50, 100] as const;

export function defaultConfig(questionCount: number): SessionConfig {
  return {
    scope: 'all',
    randomCount: Math.min(20, Math.max(1, questionCount)),
    rangeFrom: 1,
    rangeTo: Math.max(1, questionCount),
    timeLimitMin: null,
    shuffleQuestions: true,
    shuffleAnswers: true,
    onlyNew: false,
    onlyWrong: false,
    onlyStarred: false,
  };
}

export function correctIds(q: AssistQuestion): string[] {
  return q.options.filter(o => o.correct).map(o => o.id);
}

export function questionKind(q: AssistQuestion): 'single' | 'multiple' {
  return correctIds(q).length > 1 ? 'multiple' : 'single';
}

export function deriveBankMode(questions: readonly AssistQuestion[]): BankMode {
  let single = false;
  let multiple = false;
  for (const q of questions) {
    if (questionKind(q) === 'multiple') multiple = true;
    else single = true;
  }
  if (single && multiple) return 'mixed';
  return multiple ? 'multiple' : 'single';
}

/** Right only when exactly the right options are selected: a missing or an extra one makes it wrong. */
export function isAnswerCorrect(q: AssistQuestion, selected: readonly string[]): boolean {
  const want = correctIds(q);
  const got = new Set(selected);
  if (want.length !== got.size) return false;
  return want.every(id => got.has(id));
}

/** Does the question pass the status filters? They are alternatives (OR); none ticked means no filtering. */
function passesStatusFilters(p: QuestionProgress | undefined, config: SessionConfig): boolean {
  if (!config.onlyNew && !config.onlyWrong && !config.onlyStarred) return true;
  const status = p?.status ?? 'new';
  return (
    (config.onlyNew && status === 'new') ||
    (config.onlyWrong && status === 'wrong') ||
    (config.onlyStarred && !!p?.starred)
  );
}

/**
 * Questions a session would contain, before shuffling and random sampling: first the range, then the status
 * filters ("questions 400..445 that I have not answered yet").
 */
export function candidateQuestions(
  questions: readonly AssistQuestion[],
  progress: ReadonlyMap<string, QuestionProgress>,
  config: SessionConfig
): AssistQuestion[] {
  const inRange =
    config.scope === 'range'
      ? questions.filter(q => q.index >= config.rangeFrom && q.index <= config.rangeTo)
      : questions.slice();
  return inRange.filter(q => passesStatusFilters(progress.get(q.id), config));
}

/** How many questions the current settings would produce (for the "Start" dialog). */
export function countAvailable(
  questions: readonly AssistQuestion[],
  progress: ReadonlyMap<string, QuestionProgress>,
  config: SessionConfig
): number {
  const n = candidateQuestions(questions, progress, config).length;
  return config.scope === 'random' ? Math.min(n, Math.max(0, config.randomCount)) : n;
}

export interface BuildSessionInput {
  id: string;
  bank: Pick<AssistBank, 'id'>;
  mode: SessionMode;
  questions: readonly AssistQuestion[];
  progress: ReadonlyMap<string, QuestionProgress>;
  config: SessionConfig;
  now: number;
  rng: Rng;
}

/** Returns null when the settings select no questions at all. */
export function buildSession(input: BuildSessionInput): AssistSession | null {
  const { config, rng } = input;
  let picked = candidateQuestions(input.questions, input.progress, config);

  if (config.scope === 'random') {
    picked = shuffle(picked, rng).slice(0, Math.max(0, config.randomCount));
  } else if (config.shuffleQuestions) {
    picked = shuffle(picked, rng);
  }
  if (picked.length === 0) return null;

  const optionOrder: Record<string, string[]> = {};
  for (const q of picked) {
    const ids = q.options.map(o => o.id);
    optionOrder[q.id] = config.shuffleAnswers ? shuffle(ids, rng) : ids;
  }

  return {
    id: input.id,
    bankId: input.bank.id,
    mode: input.mode,
    config,
    questionIds: picked.map(q => q.id),
    optionOrder,
    answers: {},
    checked: {},
    startedAt: input.now,
    deadline: config.timeLimitMin ? input.now + config.timeLimitMin * 60_000 : undefined,
  };
}

/**
 * "Retry mistakes": a fresh training session over the given questions, with the shuffle preferences of the session
 * they came from, no time limit and no status filters.
 */
export function buildRetrySession(input: {
  id: string;
  previous: Pick<AssistSession, 'bankId' | 'config'>;
  questions: readonly AssistQuestion[];
  now: number;
  rng: Rng;
}): AssistSession | null {
  if (input.questions.length === 0) return null;
  const { config } = input.previous;
  const retryConfig: SessionConfig = {
    ...config,
    scope: 'all',
    timeLimitMin: null,
    onlyNew: false,
    onlyWrong: false,
    onlyStarred: false,
  };
  const ordered = config.shuffleQuestions ? shuffle(input.questions, input.rng) : input.questions.slice();
  const optionOrder: Record<string, string[]> = {};
  for (const q of ordered) {
    const ids = q.options.map(o => o.id);
    optionOrder[q.id] = config.shuffleAnswers ? shuffle(ids, input.rng) : ids;
  }
  return {
    id: input.id,
    bankId: input.previous.bankId,
    mode: 'training',
    config: retryConfig,
    questionIds: ordered.map(q => q.id),
    optionOrder,
    answers: {},
    checked: {},
    startedAt: input.now,
  };
}

/** Selection after the student taps an option: single replaces it, multiple toggles it. */
export function toggleSelection(q: AssistQuestion, current: readonly string[] | undefined, optionId: string): string[] {
  if (!q.options.some(o => o.id === optionId)) return current ? current.slice() : [];
  if (questionKind(q) === 'single') return [optionId];
  const now = current ?? [];
  return now.includes(optionId) ? now.filter(id => id !== optionId) : [...now, optionId];
}

/** Training: the student presses "Check". Null when there is nothing selected or the question is already checked. */
export function checkAnswer(
  session: AssistSession,
  q: AssistQuestion,
  previous: QuestionProgress | undefined,
  now: number
): { session: AssistSession; progress: QuestionProgress; correct: boolean } | null {
  const selected = session.answers[q.id];
  if (!selected || selected.length === 0 || session.checked[q.id]) return null;
  const correct = isAnswerCorrect(q, selected);
  return {
    session: { ...session, checked: { ...session.checked, [q.id]: true } },
    progress: recordAnswer(previous, q.bankId, q.id, correct, now),
    correct,
  };
}

/** Questions that count as answered: checked ones in training, any selection in an exam. */
export function answeredCount(session: AssistSession): number {
  return session.questionIds.reduce((n, id) => {
    const has = (session.answers[id]?.length ?? 0) > 0;
    return n + (has && (session.mode === 'exam' || session.checked[id]) ? 1 : 0);
  }, 0);
}

/**
 * Ends a session. In training only checked answers count (the rest were never submitted) and progress was already
 * recorded at each check; in an exam progress is recorded now, for every answered question. `endedAt` is capped at
 * the deadline, so a student who walks away from a timed exam is not credited with extra minutes.
 */
export function finishSession(
  session: AssistSession,
  byId: ReadonlyMap<string, AssistQuestion>,
  progress: ReadonlyMap<string, QuestionProgress>,
  now: number
): { session: AssistSession; updates: QuestionProgress[] } {
  if (session.endedAt) return { session, updates: [] };

  const endedAt = session.deadline !== undefined ? Math.min(now, session.deadline) : now;
  const answers: Record<string, string[]> = {};
  const updates: QuestionProgress[] = [];

  for (const id of session.questionIds) {
    const selected = session.answers[id];
    if (!selected || selected.length === 0) continue;
    if (session.mode === 'training') {
      if (session.checked[id]) answers[id] = selected;
      continue;
    }
    answers[id] = selected;
    const q = byId.get(id);
    if (q) updates.push(recordAnswer(progress.get(id), session.bankId, id, isAnswerCorrect(q, selected), endedAt));
  }
  return { session: { ...session, answers, endedAt }, updates };
}

export function isExpired(session: Pick<AssistSession, 'deadline' | 'endedAt'>, now: number): boolean {
  return !session.endedAt && session.deadline !== undefined && now >= session.deadline;
}

export function summarize(session: AssistSession, byId: ReadonlyMap<string, AssistQuestion>): SessionSummary {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const wrongIds: string[] = [];

  for (const id of session.questionIds) {
    const q = byId.get(id);
    const selected = session.answers[id];
    if (!q || !selected || selected.length === 0) {
      unanswered++;
    } else if (isAnswerCorrect(q, selected)) {
      correct++;
    } else {
      wrong++;
      wrongIds.push(id);
    }
  }
  const total = session.questionIds.length;
  return {
    total,
    correct,
    wrong,
    unanswered,
    percent: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
    wrongIds,
  };
}

export function emptyProgress(bankId: string, questionId: string): QuestionProgress {
  return { id: questionId, bankId, questionId, status: 'new', attempts: 0, correct: 0, wrong: 0, lastAt: 0, starred: false };
}

/** Progress after one more answer; the favourite flag is kept. */
export function recordAnswer(
  prev: QuestionProgress | undefined,
  bankId: string,
  questionId: string,
  wasCorrect: boolean,
  now: number
): QuestionProgress {
  const base = prev ?? emptyProgress(bankId, questionId);
  return {
    ...base,
    status: wasCorrect ? 'correct' : 'wrong',
    attempts: base.attempts + 1,
    correct: base.correct + (wasCorrect ? 1 : 0),
    wrong: base.wrong + (wasCorrect ? 0 : 1),
    lastAt: now,
  };
}

/** Stats of a bank of `total` questions from the progress rows that belong to it. */
export function statsFromProgress(total: number, rows: readonly QuestionProgress[]): BankStats {
  let correct = 0;
  let wrong = 0;
  let starred = 0;
  for (const p of rows) {
    if (p.status === 'correct') correct++;
    else if (p.status === 'wrong') wrong++;
    if (p.starred) starred++;
  }
  return {
    total,
    correct,
    wrong,
    fresh: Math.max(0, total - correct - wrong),
    starred,
    percentCorrect: total === 0 ? 0 : Math.round((correct / total) * 10000) / 100,
  };
}

export function computeBankStats(questionIds: readonly string[], progress: ReadonlyMap<string, QuestionProgress>): BankStats {
  const rows: QuestionProgress[] = [];
  for (const id of questionIds) {
    const p = progress.get(id);
    if (p) rows.push(p);
  }
  return statsFromProgress(questionIds.length, rows);
}

/** "mm:ss", or "h:mm:ss" from one hour up. Negative values show as 0:00. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Problems with the start settings that the dialog should show before starting. */
export type ConfigProblem = 'range-invalid' | 'random-invalid' | 'nothing-selected';

export function validateConfig(
  config: SessionConfig,
  questionCount: number,
  available: number
): ConfigProblem | null {
  if (config.scope === 'range') {
    const { rangeFrom: a, rangeTo: b } = config;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || a > questionCount) return 'range-invalid';
  }
  if (config.scope === 'random' && (!Number.isInteger(config.randomCount) || config.randomCount < 1)) {
    return 'random-invalid';
  }
  return available === 0 ? 'nothing-selected' : null;
}
