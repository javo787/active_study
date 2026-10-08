'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Info, ListFilter, Search, X } from 'lucide-react';
import { btnPrimary, btnQuiet, field } from '@/components/ui/styles';
import FilterDialog from './FilterDialog';
import InfoDialog from './InfoDialog';
import ViewQuestionCard from './ViewQuestionCard';
import { putProgress, type AssistIDB } from '../db';
import { emptyProgress, statsFromProgress } from '../engine';
import {
  NO_FILTER,
  activeFilterCount,
  filterCounts,
  filterQuestions,
  questionHaystack,
  searchTokens,
  statusOf,
  type ViewFilter,
} from '../view';
import type { AssistBank, AssistQuestion, QuestionProgress } from '../types';

interface Props {
  db: AssistIDB;
  bank: AssistBank;
  questions: AssistQuestion[];
  initialProgress: Map<string, QuestionProgress>;
}

const LIST_HREF = '/dashboard/student/assistant';
/** Cards are drawn in portions: 500 questions with five options each is thousands of elements for a phone. */
export const CHUNK = 40;

export default function ViewScreen({ db, bank, questions, initialProgress }: Props) {
  const { t } = useTranslation();

  const [progress, setProgress] = useState(initialProgress);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ViewFilter>(NO_FILTER);
  const [showAnswers, setShowAnswers] = useState(true);
  const [visible, setVisible] = useState(CHUNK);
  const [jump, setJump] = useState('');
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const deferredQuery = useDeferredValue(query);
  const haystacks = useMemo(() => questions.map(questionHaystack), [questions]);
  const tokens = useMemo(() => searchTokens(deferredQuery), [deferredQuery]);
  const filtered = useMemo(
    () => filterQuestions({ questions, haystacks, progress, filter, query: deferredQuery }),
    [questions, haystacks, progress, filter, deferredQuery]
  );
  const counts = useMemo(() => filterCounts(questions, progress), [questions, progress]);
  const stats = useMemo(() => statsFromProgress(bank.questionCount, Array.from(progress.values())), [bank.questionCount, progress]);

  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;
  const filtersOn = activeFilterCount(filter);
  const narrowed = filtersOn > 0 || tokens.length > 0;

  // A new search or filter starts from the top again.
  useEffect(() => {
    setVisible(CHUNK);
  }, [deferredQuery, filter]);

  // Load the next portion when the end of the list scrolls into view (the button below does the same by hand).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || remaining <= 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setVisible(v => v + CHUNK);
    }, { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [remaining, shown.length]);

  // After "go to #N": once that card exists in the page, bring it to the top.
  useEffect(() => {
    if (scrollTarget === null) return;
    const el = document.getElementById(`q-${scrollTarget}`);
    if (!el) return;
    el.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    setScrollTarget(null);
  }, [scrollTarget, shown.length]);

  const toggleStar = useCallback(
    (questionId: string) => {
      const previous = progress.get(questionId) ?? emptyProgress(bank.id, questionId);
      const next = { ...previous, starred: !previous.starred };
      setProgress(map => new Map(map).set(questionId, next));
      putProgress(db, [next]).catch(() => toast.error(t('assistant.db_error')));
    },
    [progress, bank.id, db, t]
  );

  const goTo = () => {
    const n = parseInt(jump, 10);
    if (!Number.isInteger(n) || n < 1) return;
    const position = filtered.findIndex(q => q.index === n);
    if (position === -1) {
      toast.error(t('assistant.jump_missing', { n }));
      return;
    }
    setVisible(v => Math.max(v, position + 1 + CHUNK));
    setScrollTarget(n);
  };

  const resetAll = () => {
    setQuery('');
    setFilter(NO_FILTER);
  };

  return (
    <div className="space-y-4 pb-10 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link href={LIST_HREF} className={`${btnQuiet} !px-3`} aria-label={t('assistant.back_to_list')}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{t('assistant.view')}</p>
          <h1 className="text-lg font-semibold text-slate-900 truncate" title={bank.title}>
            {bank.title}
          </h1>
        </div>
        <button type="button" className={`${btnQuiet} !px-3`} onClick={() => setInfoOpen(true)} aria-label={t('assistant.info')}>
          <Info className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-slate-50/95 backdrop-blur space-y-2">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('assistant.view_search_placeholder')}
            aria-label={t('assistant.view_search_placeholder')}
            className={`${field} !pl-10 !pr-11`}
            enterKeyHint="search"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('assistant.search_clear')}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center text-slate-500 hover:text-slate-800"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className={`${btnQuiet} relative`} onClick={() => setFilterOpen(true)}>
            <ListFilter className="w-4 h-4" aria-hidden="true" />
            {t('assistant.filter')}
            {filtersOn > 0 && (
              <span className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
                {filtersOn}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`${btnQuiet} !px-3`}
            onClick={() => setShowAnswers(v => !v)}
            aria-pressed={showAnswers}
            aria-label={showAnswers ? t('assistant.answers_on') : t('assistant.answers_off')}
            title={showAnswers ? t('assistant.answers_on') : t('assistant.answers_off')}
          >
            {showAnswers ? <Eye className="w-5 h-5" aria-hidden="true" /> : <EyeOff className="w-5 h-5" aria-hidden="true" />}
          </button>

          <form
            className="ml-auto flex items-center gap-1"
            onSubmit={e => {
              e.preventDefault();
              goTo();
            }}
          >
            <label className="sr-only" htmlFor="view-jump">
              {t('assistant.go_to')}
            </label>
            <input
              id="view-jump"
              inputMode="numeric"
              value={jump}
              onChange={e => setJump(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="№"
              className={`${field} !w-20 text-center`}
            />
            <button type="submit" className={`${btnPrimary} !px-3`} aria-label={t('assistant.go')} disabled={!jump}>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>

      <p className="text-sm text-slate-500" role="status" aria-live="polite">
        {t('assistant.showing_of', { shown: filtered.length, total: questions.length })}
      </p>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <p className="font-medium text-slate-900">{t('assistant.no_results')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('assistant.no_results_hint')}</p>
          {narrowed && (
            <button type="button" className={`${btnQuiet} mt-4`} onClick={resetAll}>
              {t('assistant.reset_all')}
            </button>
          )}
        </div>
      ) : (
        <>
          <ol className="space-y-4" aria-label={t('assistant.view_list_label')}>
            {shown.map(q => {
              const p = progress.get(q.id);
              return (
                <ViewQuestionCard
                  key={q.id}
                  question={q}
                  status={statusOf(progress, q.id)}
                  attempts={p?.attempts ?? 0}
                  correctAttempts={p?.correct ?? 0}
                  starred={!!p?.starred}
                  showAnswers={showAnswers}
                  tokens={tokens}
                  onToggleStar={toggleStar}
                />
              );
            })}
          </ol>

          {remaining > 0 && (
            <div ref={sentinel} className="flex justify-center">
              <button type="button" className={btnQuiet} onClick={() => setVisible(v => v + CHUNK)}>
                {t('assistant.show_more', { n: remaining })}
              </button>
            </div>
          )}
        </>
      )}

      {filterOpen && <FilterDialog filter={filter} counts={counts} onChange={setFilter} onClose={() => setFilterOpen(false)} />}
      {infoOpen && <InfoDialog bank={bank} stats={stats} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}
