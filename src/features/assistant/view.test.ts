import { describe, expect, it } from 'vitest';
import {
  NO_FILTER,
  activeFilterCount,
  filterCounts,
  filterQuestions,
  foldText,
  highlightSegments,
  passesFilter,
  questionHaystack,
  searchTokens,
  type ViewFilter,
} from './view';
import type { AssistQuestion, QuestionProgress } from './types';

function q(index: number, text: string, options: string[] = ['a', 'b'], bankId = 'b'): AssistQuestion {
  return {
    id: `${bankId}:${index}`,
    bankId,
    index,
    text,
    options: options.map((o, i) => ({ id: `${bankId}:${index}:${i}`, text: o, correct: i === 0 })),
  };
}

function prog(entries: Record<string, Partial<QuestionProgress>>): Map<string, QuestionProgress> {
  const m = new Map<string, QuestionProgress>();
  for (const [id, p] of Object.entries(entries)) {
    m.set(id, { id, bankId: 'b', questionId: id, status: 'new', attempts: 0, correct: 0, wrong: 0, lastAt: 0, starred: false, ...p });
  }
  return m;
}

const bank = [
  q(1, 'Пойтахти Тоҷикистон кадом аст?', ['Душанбе', 'Хуҷанд']),
  q(2, 'Capital of France?', ['Paris', 'Rome']),
  q(3, "O‘zbekiston poytaxti qaysi shahar?", ["Toshkent", "Samarqand"]),
  q(4, 'Ёлка или ёж?', ['ёлка', 'ёж']),
  q(5, 'Largest planet', ['Jupiter', 'Mars']),
];
const hay = bank.map(questionHaystack);
const run = (query: string, filter: ViewFilter = NO_FILTER, progress = new Map<string, QuestionProgress>()) =>
  filterQuestions({ questions: bank, haystacks: hay, progress, filter, query }).map(x => x.index);

describe('foldText', () => {
  it('lowercases and keeps the length', () => {
    expect(foldText('PARIS')).toBe('paris');
    for (const s of ['Тоҷикистон', "O‘zbek", 'Ёж', 'ҒҚҲҶӢӮЎ']) expect(foldText(s)).toHaveLength(s.length);
  });

  it('folds Tajik and Uzbek letters to their plain Cyrillic neighbours, and ё to е', () => {
    expect(foldText('ғақҳҷӣӯў')).toBe('гакхчиуу');
    expect(foldText('Ёлка')).toBe('елка');
  });

  it('makes typographic apostrophes plain', () => {
    expect(foldText('o‘zbek')).toBe("o'zbek");
    expect(foldText('oʻzbek')).toBe("o'zbek");
    expect(foldText('o`zbek')).toBe("o'zbek");
  });

  it('keeps й distinct from и', () => {
    expect(foldText('мой')).not.toBe(foldText('мои'));
  });
});

describe('searching', () => {
  it('finds text in questions and in options, ignoring case', () => {
    expect(run('capital')).toEqual([2]);
    expect(run('JUPITER')).toEqual([5]);
    expect(run('душанбе')).toEqual([1]);
  });

  it('finds Tajik text typed with a Russian keyboard, and the other way round', () => {
    expect(run('тоджикистон')).toEqual([]); // д-ж is not the Tajik spelling: no false match
    expect(run('точикистон')).toEqual([1]); // ҷ typed as ч
    expect(run('худжанд')).toEqual([]);
    expect(run('хучанд')).toEqual([1]);
    expect(run('Тоҷикистон')).toEqual([1]);
  });

  it('finds Uzbek Latin with either kind of apostrophe', () => {
    expect(run("o'zbekiston")).toEqual([3]);
    expect(run('oʻzbekiston')).toEqual([3]);
  });

  it('treats е and ё as the same letter', () => {
    expect(run('елка')).toEqual([4]);
    expect(run('ёж')).toEqual([4]);
  });

  it('needs every word, in any order', () => {
    expect(run('france capital')).toEqual([2]);
    expect(run('france jupiter')).toEqual([]);
  });

  it('finds a question by its number: 3 and #3', () => {
    expect(run('#3')).toEqual([3]);
    expect(run('3')).toEqual([3]); // also any text that contains a 3: none here
    expect(run('#99')).toEqual([]);
  });

  it('an empty or blank query shows everything', () => {
    expect(run('')).toEqual([1, 2, 3, 4, 5]);
    expect(run('   ')).toEqual([1, 2, 3, 4, 5]);
  });

  it('searchTokens splits and folds', () => {
    expect(searchTokens('  Ҳамид   Paris ')).toEqual(['хамид', 'paris']);
  });
});

describe('filters', () => {
  const progress = prog({
    'b:1': { status: 'correct' },
    'b:2': { status: 'wrong', starred: true },
    'b:3': { status: 'wrong' },
    'b:4': { status: 'new', starred: true },
  });

  it('none ticked shows everything', () => {
    expect(run('', NO_FILTER, progress)).toEqual([1, 2, 3, 4, 5]);
    expect(activeFilterCount(NO_FILTER)).toBe(0);
  });

  it('each status on its own; a question without progress counts as new', () => {
    expect(run('', { ...NO_FILTER, new: true }, progress)).toEqual([4, 5]);
    expect(run('', { ...NO_FILTER, wrong: true }, progress)).toEqual([2, 3]);
    expect(run('', { ...NO_FILTER, correct: true }, progress)).toEqual([1]);
    expect(run('', { ...NO_FILTER, starred: true }, progress)).toEqual([2, 4]);
  });

  it('ticked options are alternatives (or)', () => {
    expect(run('', { ...NO_FILTER, wrong: true, starred: true }, progress)).toEqual([2, 3, 4]);
    expect(activeFilterCount({ new: true, wrong: true, correct: false, starred: true })).toBe(3);
  });

  it('filters and search combine (and)', () => {
    expect(run('capital', { ...NO_FILTER, wrong: true }, progress)).toEqual([2]);
    expect(run('capital', { ...NO_FILTER, correct: true }, progress)).toEqual([]);
  });

  it('passesFilter on its own', () => {
    expect(passesFilter(NO_FILTER, 'wrong', false)).toBe(true);
    expect(passesFilter({ ...NO_FILTER, new: true }, 'wrong', false)).toBe(false);
    expect(passesFilter({ ...NO_FILTER, starred: true }, 'correct', true)).toBe(true);
  });

  it('counts for the filter dialog', () => {
    expect(filterCounts(bank, progress)).toEqual({ total: 5, new: 2, wrong: 2, correct: 1, starred: 2 });
  });
});

describe('highlightSegments', () => {
  const marked = (text: string, tokens: string[]) => highlightSegments(text, tokens).filter(s => s.marked).map(s => s.text);

  it('marks every occurrence and keeps the original spelling', () => {
    expect(marked('Paris is in France, Paris!', searchTokens('paris'))).toEqual(['Paris', 'Paris']);
    expect(marked('Тоҷикистон', searchTokens('точик'))).toEqual(['Тоҷик']);
  });

  it('pieces join back into the original text', () => {
    const text = "Capital of France? o‘zbek";
    const segments = highlightSegments(text, searchTokens("france o'zbek"));
    expect(segments.map(s => s.text).join('')).toBe(text);
    expect(segments.filter(s => s.marked).map(s => s.text)).toEqual(['France', 'o‘zbek']);
  });

  it('marks several words and overlapping matches once', () => {
    expect(marked('abcd', ['abc', 'bcd'])).toEqual(['abcd']);
  });

  it('does not mark anything without tokens, or for a #number token', () => {
    expect(highlightSegments('hello', [])).toEqual([{ text: 'hello', marked: false }]);
    expect(marked('question 12', ['#12'])).toEqual([]);
  });

  it('handles an empty text', () => {
    expect(highlightSegments('', ['a'])).toEqual([{ text: '', marked: false }]);
  });
});
