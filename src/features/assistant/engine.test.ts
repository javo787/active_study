import { describe, it, expect } from 'vitest';
import {
  answeredCount,
  buildRetrySession,
  checkAnswer,
  buildSession,
  candidateQuestions,
  computeBankStats,
  countAvailable,
  correctIds,
  defaultConfig,
  deriveBankMode,
  finishSession,
  formatDuration,
  isAnswerCorrect,
  isExpired,
  questionKind,
  recordAnswer,
  seededRng,
  shuffle,
  statsFromProgress,
  summarize,
  toggleSelection,
  validateConfig,
} from './engine';
import type { AssistQuestion, QuestionProgress, SessionConfig } from './types';

function q(index: number, correct: number[], total = 4, bankId = 'b1'): AssistQuestion {
  return {
    id: `${bankId}-q${index}`,
    bankId,
    index,
    text: `Question ${index}`,
    options: Array.from({ length: total }, (_, i) => ({
      id: `${bankId}-q${index}-o${i}`,
      text: `Option ${i}`,
      correct: correct.includes(i),
    })),
  };
}

const bank = Array.from({ length: 10 }, (_, i) => q(i + 1, [0]));
const none = new Map<string, QuestionProgress>();

function progressOf(entries: Record<string, Partial<QuestionProgress>>): Map<string, QuestionProgress> {
  const m = new Map<string, QuestionProgress>();
  for (const [id, p] of Object.entries(entries)) {
    m.set(id, { id, bankId: 'b1', questionId: id, status: 'new', attempts: 0, correct: 0, wrong: 0, lastAt: 0, starred: false, ...p });
  }
  return m;
}

const cfg = (over: Partial<SessionConfig> = {}): SessionConfig => ({ ...defaultConfig(10), shuffleQuestions: false, shuffleAnswers: false, ...over });

describe('shuffle / seededRng', () => {
  it('is deterministic for a seed and is a permutation', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng(42));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng(42));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('does not change its input', () => {
    const input = [1, 2, 3];
    shuffle(input, seededRng(1));
    expect(input).toEqual([1, 2, 3]);
  });

  it('gives different orders for different seeds', () => {
    expect(shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng(1))).not.toEqual(shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng(2)));
  });
});

describe('answer checking', () => {
  const single = q(1, [2]);
  const multi = q(2, [0, 3]);

  it('single: only the right option is right', () => {
    expect(isAnswerCorrect(single, [single.options[2].id])).toBe(true);
    expect(isAnswerCorrect(single, [single.options[1].id])).toBe(false);
    expect(isAnswerCorrect(single, [])).toBe(false);
  });

  it('multiple: needs exactly the right set', () => {
    const [a, b, c, d] = multi.options.map(o => o.id);
    expect(isAnswerCorrect(multi, [a, d])).toBe(true);
    expect(isAnswerCorrect(multi, [d, a])).toBe(true);
    expect(isAnswerCorrect(multi, [a])).toBe(false); // one missing
    expect(isAnswerCorrect(multi, [a, d, b])).toBe(false); // one extra
    expect(isAnswerCorrect(multi, [b, c])).toBe(false);
  });

  it('knows the kind of a question and of a bank', () => {
    expect(questionKind(single)).toBe('single');
    expect(questionKind(multi)).toBe('multiple');
    expect(correctIds(multi)).toHaveLength(2);
    expect(deriveBankMode([single, single])).toBe('single');
    expect(deriveBankMode([multi, multi])).toBe('multiple');
    expect(deriveBankMode([single, multi])).toBe('mixed');
  });
});

describe('choosing questions', () => {
  it('all: every question', () => {
    expect(candidateQuestions(bank, none, cfg()).map(x => x.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('range: inclusive on both ends', () => {
    const r = candidateQuestions(bank, none, cfg({ scope: 'range', rangeFrom: 4, rangeTo: 6 }));
    expect(r.map(x => x.index)).toEqual([4, 5, 6]);
  });

  it('status filters are alternatives (OR) and apply inside the range', () => {
    const progress = progressOf({
      'b1-q2': { status: 'wrong' },
      'b1-q3': { status: 'correct' },
      'b1-q5': { status: 'wrong' },
      'b1-q6': { status: 'correct', starred: true },
    });
    expect(candidateQuestions(bank, progress, cfg({ onlyWrong: true })).map(x => x.index)).toEqual([2, 5]);
    expect(candidateQuestions(bank, progress, cfg({ onlyStarred: true })).map(x => x.index)).toEqual([6]);
    expect(candidateQuestions(bank, progress, cfg({ onlyNew: true })).map(x => x.index)).toEqual([1, 4, 7, 8, 9, 10]);
    expect(candidateQuestions(bank, progress, cfg({ onlyWrong: true, onlyStarred: true })).map(x => x.index)).toEqual([2, 5, 6]);
    expect(candidateQuestions(bank, progress, cfg({ scope: 'range', rangeFrom: 3, rangeTo: 5, onlyWrong: true })).map(x => x.index)).toEqual([5]);
  });

  it('a question without any progress counts as new', () => {
    expect(candidateQuestions(bank, none, cfg({ onlyNew: true }))).toHaveLength(10);
    expect(candidateQuestions(bank, none, cfg({ onlyWrong: true }))).toHaveLength(0);
  });

  it('countAvailable caps random at what exists', () => {
    expect(countAvailable(bank, none, cfg({ scope: 'random', randomCount: 4 }))).toBe(4);
    expect(countAvailable(bank, none, cfg({ scope: 'random', randomCount: 99 }))).toBe(10);
    expect(countAvailable(bank, none, cfg({ scope: 'range', rangeFrom: 9, rangeTo: 20 }))).toBe(2);
  });
});

describe('buildSession', () => {
  const base = { id: 's1', bank: { id: 'b1' }, questions: bank, progress: none, now: 1_000, rng: seededRng(7) };

  it('keeps the bank order when shuffling is off', () => {
    const s = buildSession({ ...base, mode: 'training', config: cfg() })!;
    expect(s.questionIds).toEqual(bank.map(x => x.id));
    expect(s.optionOrder['b1-q1']).toEqual(bank[0].options.map(o => o.id));
  });

  it('shuffles questions and answers when asked, keeping the same sets', () => {
    const s = buildSession({ ...base, mode: 'training', config: cfg({ shuffleQuestions: true, shuffleAnswers: true }) })!;
    expect([...s.questionIds].sort()).toEqual(bank.map(x => x.id).sort());
    expect(s.questionIds).not.toEqual(bank.map(x => x.id));
    const order = s.optionOrder['b1-q1'];
    expect([...order].sort()).toEqual(bank[0].options.map(o => o.id).sort());
  });

  it('random: takes N distinct questions', () => {
    const s = buildSession({ ...base, mode: 'exam', config: cfg({ scope: 'random', randomCount: 4 }) })!;
    expect(s.questionIds).toHaveLength(4);
    expect(new Set(s.questionIds).size).toBe(4);
  });

  it('range: only that range, in order when not shuffled', () => {
    const s = buildSession({ ...base, mode: 'training', config: cfg({ scope: 'range', rangeFrom: 8, rangeTo: 10 }) })!;
    expect(s.questionIds).toEqual(['b1-q8', 'b1-q9', 'b1-q10']);
  });

  it('sets a deadline only when there is a time limit', () => {
    expect(buildSession({ ...base, mode: 'exam', config: cfg() })!.deadline).toBeUndefined();
    expect(buildSession({ ...base, mode: 'exam', config: cfg({ timeLimitMin: 30 }) })!.deadline).toBe(1_000 + 30 * 60_000);
  });

  it('returns null when nothing is selected', () => {
    expect(buildSession({ ...base, mode: 'training', config: cfg({ onlyWrong: true }) })).toBeNull();
  });

  it('starts with no answers', () => {
    const s = buildSession({ ...base, mode: 'training', config: cfg() })!;
    expect(s.answers).toEqual({});
    expect(s.checked).toEqual({});
    expect(s.endedAt).toBeUndefined();
  });
});

describe('time', () => {
  it('expires only after the deadline and only while running', () => {
    expect(isExpired({ deadline: 100 }, 99)).toBe(false);
    expect(isExpired({ deadline: 100 }, 100)).toBe(true);
    expect(isExpired({ deadline: 100, endedAt: 50 }, 200)).toBe(false);
    expect(isExpired({}, 1e12)).toBe(false);
  });
});

describe('summarize', () => {
  const qs = [q(1, [0]), q(2, [1]), q(3, [2]), q(4, [0, 1])];
  const byId = new Map(qs.map(x => [x.id, x]));
  const session = {
    id: 's',
    bankId: 'b1',
    mode: 'exam' as const,
    config: defaultConfig(4),
    questionIds: qs.map(x => x.id),
    optionOrder: {},
    answers: {
      'b1-q1': ['b1-q1-o0'], // right
      'b1-q2': ['b1-q2-o3'], // wrong
      // q3 unanswered
      'b1-q4': ['b1-q4-o0'], // only one of two: wrong
    },
    checked: {},
    startedAt: 0,
  };

  it('counts right, wrong and unanswered, and lists the wrong ones', () => {
    const r = summarize(session, byId);
    expect(r).toMatchObject({ total: 4, correct: 1, wrong: 2, unanswered: 1, percent: 25 });
    expect(r.wrongIds).toEqual(['b1-q2', 'b1-q4']);
  });

  it('an empty selection counts as unanswered', () => {
    const r = summarize({ ...session, answers: { 'b1-q1': [] } }, byId);
    expect(r.unanswered).toBe(4);
  });

  it('percent is 0 for an empty session', () => {
    expect(summarize({ ...session, questionIds: [], answers: {} }, byId).percent).toBe(0);
  });
});

describe('progress', () => {
  it('records the last result and the counters, and keeps the favourite flag', () => {
    const first = recordAnswer(undefined, 'b1', 'x', false, 10);
    expect(first).toMatchObject({ status: 'wrong', attempts: 1, wrong: 1, correct: 0, lastAt: 10, starred: false });
    const second = recordAnswer({ ...first, starred: true }, 'b1', 'x', true, 20);
    expect(second).toMatchObject({ status: 'correct', attempts: 2, wrong: 1, correct: 1, lastAt: 20, starred: true });
  });

  it('bank stats: percent of questions whose last answer is right', () => {
    const progress = progressOf({
      a: { status: 'correct' },
      b: { status: 'correct', starred: true },
      c: { status: 'wrong' },
    });
    const s = computeBankStats(['a', 'b', 'c', 'd'], progress);
    expect(s).toEqual({ total: 4, correct: 2, wrong: 1, fresh: 1, starred: 1, percentCorrect: 50 });
  });

  it('ignores progress of questions that are not in the bank any more', () => {
    const progress = progressOf({ gone: { status: 'correct' } });
    expect(computeBankStats(['a'], progress)).toMatchObject({ correct: 0, fresh: 1 });
  });

  it('percent has two decimals like the list in the reference app (36 of 445 = 8.09)', () => {
    const ids = Array.from({ length: 445 }, (_, i) => `q${i}`);
    const progress = progressOf(Object.fromEntries(ids.slice(0, 36).map(id => [id, { status: 'correct' as const }])));
    expect(computeBankStats(ids, progress).percentCorrect).toBe(8.09);
  });
});

describe('validateConfig', () => {
  it('accepts sensible settings', () => {
    expect(validateConfig(cfg(), 10, 10)).toBeNull();
    expect(validateConfig(cfg({ scope: 'range', rangeFrom: 2, rangeTo: 5 }), 10, 4)).toBeNull();
  });

  it('rejects a bad range', () => {
    expect(validateConfig(cfg({ scope: 'range', rangeFrom: 5, rangeTo: 2 }), 10, 0)).toBe('range-invalid');
    expect(validateConfig(cfg({ scope: 'range', rangeFrom: 0, rangeTo: 3 }), 10, 3)).toBe('range-invalid');
    expect(validateConfig(cfg({ scope: 'range', rangeFrom: 11, rangeTo: 12 }), 10, 0)).toBe('range-invalid');
    expect(validateConfig(cfg({ scope: 'range', rangeFrom: 1.5, rangeTo: 3 }), 10, 3)).toBe('range-invalid');
  });

  it('rejects a bad random count and an empty selection', () => {
    expect(validateConfig(cfg({ scope: 'random', randomCount: 0 }), 10, 0)).toBe('random-invalid');
    expect(validateConfig(cfg({ onlyWrong: true }), 10, 0)).toBe('nothing-selected');
  });
});

describe('statsFromProgress', () => {
  it('counts from the rows alone, without needing the questions', () => {
    const rows = [
      { status: 'correct', starred: false },
      { status: 'wrong', starred: true },
      { status: 'new', starred: true },
    ].map((r, i) => ({ id: `q${i}`, bankId: 'b1', questionId: `q${i}`, attempts: 1, correct: 0, wrong: 0, lastAt: 0, ...r })) as QuestionProgress[];
    expect(statsFromProgress(5, rows)).toEqual({ total: 5, correct: 1, wrong: 1, fresh: 3, starred: 2, percentCorrect: 20 });
  });

  it('never reports a negative number of fresh questions', () => {
    const rows = [{ id: 'a', bankId: 'b', questionId: 'a', status: 'correct', attempts: 1, correct: 1, wrong: 0, lastAt: 0, starred: false }] as QuestionProgress[];
    expect(statsFromProgress(0, rows).fresh).toBe(0);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [1000, '0:01'],
    [65_000, '1:05'],
    [600_000, '10:00'],
    [3_600_000, '1:00:00'],
    [3_725_000, '1:02:05'],
    [-5000, '0:00'],
  ])('%i ms -> %s', (ms, text) => expect(formatDuration(ms)).toBe(text));
});

describe('buildRetrySession', () => {
  const wrongOnes = [q(3, [1]), q(7, [0, 2])];
  const previous = { bankId: 'b1', config: cfg({ scope: 'range', rangeFrom: 1, rangeTo: 5, timeLimitMin: 30, onlyWrong: true, shuffleQuestions: false, shuffleAnswers: false }) };

  it('is a training session over exactly those questions, without limits or filters', () => {
    const s = buildRetrySession({ id: 'r1', previous, questions: wrongOnes, now: 5, rng: seededRng(1) })!;
    expect(s).toMatchObject({ id: 'r1', bankId: 'b1', mode: 'training', startedAt: 5 });
    expect(s.questionIds).toEqual(['b1-q3', 'b1-q7']);
    expect(s.deadline).toBeUndefined();
    expect(s.config).toMatchObject({ scope: 'all', timeLimitMin: null, onlyNew: false, onlyWrong: false, onlyStarred: false });
    expect(s.answers).toEqual({});
  });

  it('keeps the shuffle preferences of the original session', () => {
    const shuffled = buildRetrySession({ id: 'r', previous: { ...previous, config: cfg({ shuffleQuestions: true, shuffleAnswers: true }) }, questions: bank, now: 1, rng: seededRng(3) })!;
    expect([...shuffled.questionIds].sort()).toEqual(bank.map(x => x.id).sort());
    expect(shuffled.questionIds).not.toEqual(bank.map(x => x.id));
    expect(shuffled.optionOrder['b1-q1']).not.toEqual(bank[0].options.map(o => o.id));
  });

  it('returns null when there is nothing to retry', () => {
    expect(buildRetrySession({ id: 'r', previous, questions: [], now: 1, rng: seededRng(1) })).toBeNull();
  });
});

describe('toggleSelection', () => {
  const single = q(1, [1]);
  const multi = q(2, [0, 1]);

  it('single: the tapped option replaces the previous one', () => {
    expect(toggleSelection(single, undefined, 'b1-q1-o2')).toEqual(['b1-q1-o2']);
    expect(toggleSelection(single, ['b1-q1-o2'], 'b1-q1-o0')).toEqual(['b1-q1-o0']);
    expect(toggleSelection(single, ['b1-q1-o0'], 'b1-q1-o0')).toEqual(['b1-q1-o0']); // a radio does not unselect
  });

  it('multiple: taps add and remove', () => {
    let sel = toggleSelection(multi, undefined, 'b1-q2-o0');
    sel = toggleSelection(multi, sel, 'b1-q2-o2');
    expect(sel).toEqual(['b1-q2-o0', 'b1-q2-o2']);
    expect(toggleSelection(multi, sel, 'b1-q2-o0')).toEqual(['b1-q2-o2']);
  });

  it('ignores an id that is not an option of the question', () => {
    expect(toggleSelection(single, ['b1-q1-o0'], 'nope')).toEqual(['b1-q1-o0']);
    expect(toggleSelection(single, undefined, 'nope')).toEqual([]);
  });

  it('does not change its input', () => {
    const current = ['b1-q2-o0'];
    toggleSelection(multi, current, 'b1-q2-o1');
    expect(current).toEqual(['b1-q2-o0']);
  });
});

describe('a training session, step by step', () => {
  const questions = [q(1, [0]), q(2, [1]), q(3, [2])];
  const byId = new Map(questions.map(x => [x.id, x]));
  const start = () =>
    buildSession({ id: 's', bank: { id: 'b1' }, mode: 'training', questions, progress: new Map(), config: cfg(), now: 0, rng: seededRng(1) })!;

  it('check marks the question and records progress; a second check does nothing', () => {
    let s = start();
    s = { ...s, answers: { 'b1-q1': ['b1-q1-o0'] } };
    const first = checkAnswer(s, questions[0], undefined, 10)!;
    expect(first.correct).toBe(true);
    expect(first.session.checked['b1-q1']).toBe(true);
    expect(first.progress).toMatchObject({ status: 'correct', attempts: 1, lastAt: 10 });
    expect(checkAnswer(first.session, questions[0], first.progress, 11)).toBeNull();
  });

  it('check does nothing without a selection', () => {
    expect(checkAnswer(start(), questions[0], undefined, 1)).toBeNull();
    expect(checkAnswer({ ...start(), answers: { 'b1-q1': [] } }, questions[0], undefined, 1)).toBeNull();
  });

  it('a wrong check records a mistake', () => {
    const s = { ...start(), answers: { 'b1-q2': ['b1-q2-o0'] } };
    const r = checkAnswer(s, questions[1], undefined, 5)!;
    expect(r.correct).toBe(false);
    expect(r.progress.status).toBe('wrong');
  });

  it('finishing keeps only checked answers and records nothing more', () => {
    const s = { ...start(), answers: { 'b1-q1': ['b1-q1-o0'], 'b1-q2': ['b1-q2-o3'] }, checked: { 'b1-q1': true } };
    const { session, updates } = finishSession(s, byId, new Map(), 100);
    expect(session.answers).toEqual({ 'b1-q1': ['b1-q1-o0'] });
    expect(session.endedAt).toBe(100);
    expect(updates).toEqual([]);
    expect(answeredCount(s)).toBe(1);
  });
});

describe('an exam session', () => {
  const questions = [q(1, [0]), q(2, [1]), q(3, [2])];
  const byId = new Map(questions.map(x => [x.id, x]));
  const exam = (over: Record<string, unknown> = {}) => ({
    ...buildSession({ id: 'e', bank: { id: 'b1' }, mode: 'exam', questions, progress: new Map(), config: cfg(), now: 0, rng: seededRng(1) })!,
    answers: { 'b1-q1': ['b1-q1-o0'], 'b1-q2': ['b1-q2-o3'] },
    ...over,
  });

  it('records progress for every answered question when it ends, right or wrong', () => {
    const { session, updates } = finishSession(exam(), byId, new Map(), 500);
    expect(updates.map(u => [u.questionId, u.status])).toEqual([
      ['b1-q1', 'correct'],
      ['b1-q2', 'wrong'],
    ]);
    expect(session.endedAt).toBe(500);
    expect(answeredCount(exam())).toBe(2);
  });

  it('builds on earlier progress and keeps favourites', () => {
    const before = progressOf({ 'b1-q1': { status: 'wrong', attempts: 2, wrong: 2, starred: true } });
    const { updates } = finishSession(exam(), byId, before, 500);
    expect(updates[0]).toMatchObject({ questionId: 'b1-q1', status: 'correct', attempts: 3, wrong: 2, correct: 1, starred: true });
  });

  it('caps the end time at the deadline', () => {
    const { session, updates } = finishSession(exam({ deadline: 300 }), byId, new Map(), 9_999);
    expect(session.endedAt).toBe(300);
    expect(updates.every(u => u.lastAt === 300)).toBe(true);
  });

  it('finishing twice changes nothing the second time', () => {
    const first = finishSession(exam(), byId, new Map(), 500);
    const second = finishSession(first.session, byId, new Map(), 900);
    expect(second.session.endedAt).toBe(500);
    expect(second.updates).toEqual([]);
  });
});
