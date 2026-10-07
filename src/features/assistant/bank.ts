import { deriveBankMode } from './engine';
import type { ParsedQuestion } from './parser';
import type { AssistBank, AssistQuestion } from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** "my_bank_2026.txt" -> "my bank 2026": a readable default title. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base || 'Untitled';
}

export interface NewBankInput {
  id?: string;
  title: string;
  sourceName?: string;
  parsed: readonly ParsedQuestion[];
  now: number;
}

/**
 * Turns parsed questions into a bank. Ids are derived from the bank id and the position, so they are unique across
 * banks and stable: exporting and re-importing a bank never mixes up progress of different questions.
 */
export function buildBank(input: NewBankInput): { bank: AssistBank; questions: AssistQuestion[] } {
  const bankId = input.id ?? newId();
  const questions: AssistQuestion[] = input.parsed.map((p, i) => {
    const id = `${bankId}:${i + 1}`;
    return {
      id,
      bankId,
      index: i + 1,
      text: p.text,
      options: p.options.map((o, k) => ({ id: `${id}:${k}`, text: o.text, correct: o.correct })),
    };
  });

  const bank: AssistBank = {
    id: bankId,
    title: input.title.trim() || 'Untitled',
    createdAt: input.now,
    updatedAt: input.now,
    questionCount: questions.length,
    mode: deriveBankMode(questions),
    sourceName: input.sourceName,
  };
  return { bank, questions };
}
