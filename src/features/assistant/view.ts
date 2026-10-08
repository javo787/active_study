// Pure logic of the "View" screen: which questions to show for a search text and a set of filters, and where the
// searched words are, for highlighting. No React, no storage.

import type { AssistQuestion, QuestionProgress, QuestionStatus } from './types';

/** Ticked statuses are alternatives ("unanswered OR mistakes"); none ticked means everything. */
export interface ViewFilter {
  new: boolean;
  wrong: boolean;
  correct: boolean;
  starred: boolean;
}

export const NO_FILTER: ViewFilter = { new: false, wrong: false, correct: false, starred: false };

export function activeFilterCount(f: ViewFilter): number {
  return (f.new ? 1 : 0) + (f.wrong ? 1 : 0) + (f.correct ? 1 : 0) + (f.starred ? 1 : 0);
}

// Letters that people type with the nearest letter of a plain keyboard. Folding them lets "ҳамид" be found by typing
// "хамид" on a Russian keyboard (Tajik and Uzbek Cyrillic have letters a Russian layout does not).
const FOLD: Record<string, string> = {
  ё: 'е',
  ғ: 'г',
  қ: 'к',
  ҳ: 'х',
  ҷ: 'ч',
  ӣ: 'и',
  ӯ: 'у',
  ў: 'у',
  // Typographic apostrophes of Uzbek Latin (o‘, g‘) and others all become a plain apostrophe.
  '\u2018': "'",
  '\u2019': "'",
  '\u02bb': "'",
  '\u02bc': "'",
  '`': "'",
};

/** Folds one UTF-16 unit to exactly one unit, so positions in the folded text are positions in the original. */
function foldUnit(ch: string): string {
  const lower = ch.toLowerCase();
  const one = lower.length === 1 ? lower : ch;
  return FOLD[one] ?? one;
}

export function foldText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) out += foldUnit(s[i]);
  return out;
}

/** The words of a search text, folded. Several words must all be present, in any order. */
export function searchTokens(query: string): string[] {
  return foldText(query).trim().split(/\s+/).filter(Boolean);
}

export function questionHaystack(q: AssistQuestion): string {
  return foldText([q.text, ...q.options.map(o => o.text)].join('\n'));
}

export function statusOf(progress: ReadonlyMap<string, QuestionProgress>, questionId: string): QuestionStatus {
  return progress.get(questionId)?.status ?? 'new';
}

export function passesFilter(f: ViewFilter, status: QuestionStatus, starred: boolean): boolean {
  if (activeFilterCount(f) === 0) return true;
  return (f.new && status === 'new') || (f.wrong && status === 'wrong') || (f.correct && status === 'correct') || (f.starred && starred);
}

/** "12" or "#12" also finds question number 12, besides any text containing those digits. */
function matchesToken(q: AssistQuestion, haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true;
  const digits = /^#?(\d+)$/.exec(token);
  return digits !== null && Number(digits[1]) === q.index;
}

export function filterQuestions(input: {
  questions: readonly AssistQuestion[];
  /** Folded text of each question, same order (built once with questionHaystack, not per keystroke). */
  haystacks: readonly string[];
  progress: ReadonlyMap<string, QuestionProgress>;
  filter: ViewFilter;
  query: string;
}): AssistQuestion[] {
  const tokens = searchTokens(input.query);
  const result: AssistQuestion[] = [];
  input.questions.forEach((q, i) => {
    const p = input.progress.get(q.id);
    if (!passesFilter(input.filter, p?.status ?? 'new', !!p?.starred)) return;
    if (tokens.length > 0 && !tokens.every(t => matchesToken(q, input.haystacks[i], t))) return;
    result.push(q);
  });
  return result;
}

export interface FilterCounts {
  total: number;
  new: number;
  wrong: number;
  correct: number;
  starred: number;
}

export function filterCounts(questions: readonly AssistQuestion[], progress: ReadonlyMap<string, QuestionProgress>): FilterCounts {
  const counts: FilterCounts = { total: questions.length, new: 0, wrong: 0, correct: 0, starred: 0 };
  for (const q of questions) {
    const p = progress.get(q.id);
    counts[p?.status ?? 'new']++;
    if (p?.starred) counts.starred++;
  }
  return counts;
}

export interface Segment {
  text: string;
  marked: boolean;
}

/**
 * Splits `text` into pieces, marking those that match a search word. Matching is done on the folded text; folding
 * keeps every position, so the pieces are cut from the original and keep their own spelling.
 */
export function highlightSegments(text: string, tokens: readonly string[]): Segment[] {
  if (tokens.length === 0 || text === '') return [{ text, marked: false }];
  const folded = foldText(text);
  const marked = new Array<boolean>(text.length).fill(false);

  for (const token of tokens) {
    // A number token ("12", "#12") is a question number, not a text to mark.
    if (/^#\d+$/.test(token)) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at === -1) break;
      for (let k = at; k < at + token.length; k++) marked[k] = true;
      from = at + Math.max(1, token.length);
    }
  }

  const segments: Segment[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marked[i] !== marked[start]) {
      segments.push({ text: text.slice(start, i), marked: marked[start] });
      start = i;
    }
  }
  return segments;
}
