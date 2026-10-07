// Domain types of the student "Assistant" (training tests). Everything here lives only on the student's device.

export interface AssistOption {
  id: string;
  text: string;
  correct: boolean;
}

export interface AssistQuestion {
  /** Unique across all banks. */
  id: string;
  bankId: string;
  /** 1-based position inside the bank; stable, used for "range from..to" and for display (#12). */
  index: number;
  text: string;
  options: AssistOption[];
}

/** single = every question has one right answer, multiple = every one has several, mixed = both occur. */
export type BankMode = 'single' | 'multiple' | 'mixed';

export interface AssistBank {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  questionCount: number;
  mode: BankMode;
  /** Original file name, for the student's own reference. */
  sourceName?: string;
}

export type QuestionStatus = 'new' | 'correct' | 'wrong';

/** What the student has done with one question so far (last result + counters + favourite flag). */
export interface QuestionProgress {
  /** Same as questionId (question ids are unique across banks). */
  id: string;
  bankId: string;
  questionId: string;
  status: QuestionStatus;
  attempts: number;
  correct: number;
  wrong: number;
  lastAt: number;
  starred: boolean;
}

export interface BankStats {
  total: number;
  /** Questions whose last answer was right ("36 / 8.09%" in the list). */
  correct: number;
  wrong: number;
  /** Questions never answered. */
  fresh: number;
  starred: number;
  percentCorrect: number;
}

export type SessionMode = 'training' | 'exam';
export type QuestionScope = 'all' | 'random' | 'range';

export interface SessionConfig {
  scope: QuestionScope;
  /** Used when scope = random. */
  randomCount: number;
  /** Used when scope = range, 1-based and inclusive. */
  rangeFrom: number;
  rangeTo: number;
  /** null = no time limit. */
  timeLimitMin: number | null;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  /** Status filters are combined with OR: "not answered OR mistakes". None ticked = no filtering. */
  onlyNew: boolean;
  onlyWrong: boolean;
  onlyStarred: boolean;
}

export interface AssistSession {
  id: string;
  bankId: string;
  mode: SessionMode;
  config: SessionConfig;
  /** Questions of this session in the order they are shown. */
  questionIds: string[];
  /** Option ids in display order, per question (frozen when the session starts, so a reload shows the same order). */
  optionOrder: Record<string, string[]>;
  /** Selected option ids per question. Missing key = not answered. */
  answers: Record<string, string[]>;
  /** Training only: questions the student has already pressed "Check" on. */
  checked: Record<string, boolean>;
  startedAt: number;
  /** Epoch ms when the timer runs out (only when a time limit is set). */
  deadline?: number;
  endedAt?: number;
}

export interface SessionSummary {
  total: number;
  correct: number;
  wrong: number;
  unanswered: number;
  percent: number;
  wrongIds: string[];
}
