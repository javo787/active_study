'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { ArrowLeft, ClipboardList, RotateCcw } from 'lucide-react';
import { btnPrimary, btnQuiet, surface } from '@/components/ui/styles';
import QuestionCard from './QuestionCard';
import { formatDuration, summarize } from '../engine';
import type { AssistQuestion, AssistSession } from '../types';

interface Props {
  session: AssistSession;
  byId: ReadonlyMap<string, AssistQuestion>;
  onRetry: (wrongIds: string[]) => Promise<void>;
  onBack: () => void;
}

export default function ResultView({ session, byId, onRetry, onBack }: Props) {
  const { t } = useTranslation();
  const [showReview, setShowReview] = useState(false);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => summarize(session, byId), [session, byId]);
  const spentMs = (session.endedAt ?? session.startedAt) - session.startedAt;

  // Review shows what went wrong and what was skipped, in the order of the session.
  const reviewIds = session.questionIds.filter(id => {
    const picked = session.answers[id];
    return !picked || picked.length === 0 || summary.wrongIds.includes(id);
  });

  const retry = async () => {
    setBusy(true);
    try {
      await onRetry(summary.wrongIds);
    } catch {
      toast.error(t('assistant.db_error'));
      setBusy(false);
    }
  };

  const tone = summary.percent >= 70 ? 'text-emerald-700' : summary.percent >= 50 ? 'text-amber-700' : 'text-red-700';

  return (
    <div className="space-y-6 pb-10 max-w-3xl">
      <section className={`${surface} p-5 sm:p-6 text-center`} aria-labelledby="result-heading">
        <h1 id="result-heading" className="text-sm font-medium text-slate-500 uppercase tracking-wide">
          {t('assistant.result_title')}
        </h1>
        <p className={`mt-2 text-5xl font-semibold ${tone}`}>{summary.percent}%</p>
        <p className="mt-1 text-sm text-slate-500">
          {summary.correct} / {summary.total}
        </p>
        <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-slate-700">
          <li className="text-emerald-700">{t('assistant.result_correct', { n: summary.correct })}</li>
          <li className="text-red-700">{t('assistant.result_wrong', { n: summary.wrong })}</li>
          <li>{t('assistant.result_unanswered', { n: summary.unanswered })}</li>
          <li>{t('assistant.result_time', { time: formatDuration(spentMs) })}</li>
        </ul>
      </section>

      <div className="flex flex-col sm:flex-row gap-2">
        {summary.wrongIds.length > 0 ? (
          <button type="button" className={btnPrimary} onClick={() => void retry()} disabled={busy}>
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            {t('assistant.retry')} ({summary.wrongIds.length})
          </button>
        ) : (
          <p className="flex items-center text-sm font-medium text-emerald-700 min-h-[44px]">
            {summary.unanswered === 0 ? t('assistant.no_mistakes') : ''}
          </p>
        )}
        {reviewIds.length > 0 && (
          <button type="button" className={btnQuiet} onClick={() => setShowReview(v => !v)} aria-expanded={showReview}>
            <ClipboardList className="w-4 h-4" aria-hidden="true" />
            {t('assistant.review')} ({reviewIds.length})
          </button>
        )}
        <button type="button" className={btnQuiet} onClick={onBack}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {t('assistant.back_to_list')}
        </button>
      </div>

      {showReview && (
        <ol className="space-y-4">
          {reviewIds.map(id => {
            const q = byId.get(id);
            if (!q) return null;
            const picked = session.answers[id] ?? [];
            return (
              <li key={id}>
                {picked.length === 0 && <p className="mb-1 text-xs font-medium text-slate-500">{t('assistant.no_answer')}</p>}
                <QuestionCard
                  question={q}
                  optionIds={session.optionOrder[id] ?? q.options.map(o => o.id)}
                  selected={picked}
                  state="review"
                  number={q.index}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
