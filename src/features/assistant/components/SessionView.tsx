'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Clock, Flag } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { btnPrimary, btnQuiet, surface } from '@/components/ui/styles';
import QuestionCard from './QuestionCard';
import ResultView from './ResultView';
import { newId } from '../bank';
import { putProgress, saveSession, type AssistIDB } from '../db';
import {
  answeredCount,
  buildRetrySession,
  checkAnswer,
  emptyProgress,
  finishSession,
  formatDuration,
  isAnswerCorrect,
  isExpired,
  seededRng,
  toggleSelection,
} from '../engine';
import type { AssistBank, AssistQuestion, AssistSession, QuestionProgress } from '../types';

interface Props {
  db: AssistIDB;
  bank: AssistBank;
  initial: AssistSession;
  questions: AssistQuestion[];
  initialProgress: Map<string, QuestionProgress>;
}

const LIST_HREF = '/dashboard/student/assistant';

export default function SessionView({ db, bank, initial, questions, initialProgress }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const byId = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions]);
  const [session, setSession] = useState(initial);
  const [progress, setProgress] = useState(initialProgress);
  const [index, setIndex] = useState(() => {
    // Resume at the first question that is not done yet.
    const first = initial.questionIds.findIndex(id => (initial.mode === 'training' ? !initial.checked[id] : !initial.answers[id]?.length));
    return first === -1 ? 0 : first;
  });
  const [now, setNow] = useState(() => Date.now());
  const [confirmFinish, setConfirmFinish] = useState(false);
  const finishing = useRef(false);

  const training = session.mode === 'training';
  const ended = !!session.endedAt;
  const total = session.questionIds.length;
  const question = byId.get(session.questionIds[index]);

  const fail = useCallback(() => toast.error(t('assistant.db_error')), [t]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setConfirmFinish(false);
    try {
      const { session: done, updates } = finishSession(session, byId, progress, Date.now());
      await putProgress(db, updates);
      await saveSession(db, done);
      setProgress(prev => {
        const next = new Map(prev);
        updates.forEach(u => next.set(u.questionId, u));
        return next;
      });
      setSession(done);
    } catch {
      fail();
      finishing.current = false;
    }
  }, [session, byId, progress, db, fail]);

  // Clock: ticks once a second while a timed session runs, and ends it when the time is up.
  useEffect(() => {
    if (ended || session.deadline === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ended, session.deadline]);

  useEffect(() => {
    if (!ended && isExpired(session, now)) {
      toast(t('assistant.time_up'));
      void finish();
    }
  }, [ended, session, now, finish, t]);

  const select = (optionId: string) => {
    if (!question || ended || (training && session.checked[question.id])) return;
    const next: AssistSession = {
      ...session,
      answers: { ...session.answers, [question.id]: toggleSelection(question, session.answers[question.id], optionId) },
    };
    setSession(next);
    saveSession(db, next).catch(fail);
  };

  const check = async () => {
    if (!question) return;
    const result = checkAnswer(session, question, progress.get(question.id), Date.now());
    if (!result) return;
    setSession(result.session);
    setProgress(prev => new Map(prev).set(question.id, result.progress));
    try {
      await putProgress(db, [result.progress]);
      await saveSession(db, result.session);
    } catch {
      fail();
    }
  };

  const toggleStar = async () => {
    if (!question) return;
    const prev = progress.get(question.id) ?? emptyProgress(bank.id, question.id);
    const next = { ...prev, starred: !prev.starred };
    setProgress(map => new Map(map).set(question.id, next));
    try {
      await putProgress(db, [next]);
    } catch {
      fail();
    }
  };

  const retry = async (wrongIds: string[]) => {
    const retryQuestions = wrongIds.map(id => byId.get(id)).filter((q): q is AssistQuestion => !!q);
    const next = buildRetrySession({
      id: newId(),
      previous: session,
      questions: retryQuestions,
      now: Date.now(),
      rng: seededRng((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0),
    });
    if (!next) return;
    await saveSession(db, next);
    router.push(`${LIST_HREF}/session?id=${next.id}`);
  };

  if (ended) {
    return <ResultView session={session} byId={byId} onRetry={retry} onBack={() => router.push(LIST_HREF)} />;
  }
  if (!question) return null;

  const answered = answeredCount(session);
  const selected = session.answers[question.id] ?? [];
  const isChecked = !!session.checked[question.id];
  const remaining = session.deadline !== undefined ? session.deadline - now : null;
  const lastQuestion = index === total - 1;
  const unanswered = total - answered;

  const gridClass = (id: string, i: number) => {
    const picked = (session.answers[id]?.length ?? 0) > 0;
    const q = byId.get(id);
    let tone = 'bg-white border-slate-300 text-slate-700';
    if (training && session.checked[id] && q) {
      tone = isAnswerCorrect(q, session.answers[id] ?? []) ? 'bg-emerald-100 border-emerald-500 text-emerald-800' : 'bg-red-100 border-red-500 text-red-800';
    } else if (!training && picked) {
      tone = 'bg-blue-100 border-blue-500 text-blue-800';
    }
    return `${tone} ${i === index ? 'ring-2 ring-offset-1 ring-blue-600' : ''}`;
  };

  return (
    <div className="space-y-4 pb-24 max-w-3xl">
      <div className={`${surface} p-3 sm:p-4 flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 truncate">
            {bank.title} · {training ? t('assistant.training') : t('assistant.exam')}
          </p>
          <p className="text-sm font-semibold text-slate-900">{t('assistant.question_of', { n: index + 1, total })}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {remaining !== null && (
            <span
              role="timer"
              aria-label={t('assistant.time_left', { time: formatDuration(remaining) })}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${remaining < 60_000 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}
            >
              <Clock className="w-4 h-4" aria-hidden="true" />
              {formatDuration(remaining)}
            </span>
          )}
          <button type="button" className={btnQuiet} onClick={() => (unanswered === 0 && training ? void finish() : setConfirmFinish(true))}>
            <Flag className="w-4 h-4" aria-hidden="true" />
            {t('assistant.finish')}
          </button>
        </div>
      </div>

      <div
        className="h-1.5 rounded-full bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-label={t('assistant.answered', { done: answered, total })}
      >
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${total === 0 ? 0 : (answered / total) * 100}%` }} />
      </div>

      <QuestionCard
        key={question.id}
        question={question}
        optionIds={session.optionOrder[question.id] ?? question.options.map(o => o.id)}
        selected={selected}
        state={training && isChecked ? 'checked' : 'answering'}
        number={question.index}
        starred={progress.get(question.id)?.starred}
        onToggleOption={select}
        onToggleStar={() => void toggleStar()}
      />

      {training && isChecked && (
        <p
          role="status"
          className={`text-sm font-semibold ${isAnswerCorrect(question, selected) ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {isAnswerCorrect(question, selected) ? t('assistant.right') : t('assistant.wrong')}
        </p>
      )}

      <details className={`${surface} p-3`}>
        <summary className="cursor-pointer min-h-[44px] flex items-center text-sm font-medium text-slate-700">
          {t('assistant.questions_list')} · {t('assistant.answered', { done: answered, total })}
        </summary>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
          {session.questionIds.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? 'true' : undefined}
              className={`min-h-[44px] rounded-lg border text-sm font-medium ${gridClass(id, i)}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </details>

      <div
        className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 px-3 pt-3 md:left-64"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-3xl mx-auto flex gap-2">
          <button type="button" className={btnQuiet} onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t('assistant.prev')}</span>
          </button>

          {training && !isChecked ? (
            <button type="button" className={`${btnPrimary} flex-1`} onClick={() => void check()} disabled={selected.length === 0}>
              {t('assistant.check')}
            </button>
          ) : lastQuestion ? (
            <button type="button" className={`${btnPrimary} flex-1`} onClick={() => (unanswered === 0 ? void finish() : setConfirmFinish(true))}>
              {t('assistant.finish')}
            </button>
          ) : (
            <button type="button" className={`${btnPrimary} flex-1`} onClick={() => setIndex(i => Math.min(total - 1, i + 1))}>
              {t('assistant.next')}
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmFinish}
        title={training ? t('assistant.finish_title_training') : t('assistant.finish_title')}
        message={unanswered > 0 ? t('assistant.finish_text', { n: unanswered }) : t('assistant.finish_text_all')}
        confirmText={t('assistant.finish')}
        cancelText={t('assistant.keep_going')}
        onConfirm={() => void finish()}
        onCancel={() => setConfirmFinish(false)}
      />
    </div>
  );
}
