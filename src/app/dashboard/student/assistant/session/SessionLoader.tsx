'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { btnQuiet } from '@/components/ui/styles';
import { useAssistDb } from '@/features/assistant/useAssistDb';
import { getBank, getProgress, getQuestions, getSession } from '@/features/assistant/db';
import SessionView from '@/features/assistant/components/SessionView';
import type { AssistBank, AssistQuestion, AssistSession, QuestionProgress } from '@/features/assistant/types';

interface Loaded {
  session: AssistSession;
  bank: AssistBank;
  questions: AssistQuestion[];
  progress: Map<string, QuestionProgress>;
}

/** Reads everything one session needs from the local database, then hands over to the session screen. */
export default function SessionLoader() {
  const { t } = useTranslation();
  const id = useSearchParams().get('id');
  const { db, failed } = useAssistDb();
  const [state, setState] = useState<{ id: string | null; data: Loaded | null; done: boolean }>({ id: null, data: null, done: false });

  useEffect(() => {
    if (!db || !id) return;
    let cancelled = false;
    (async () => {
      let data: Loaded | null = null;
      try {
        const session = await getSession(db, id);
        const bank = session ? await getBank(db, session.bankId) : undefined;
        if (session && bank) {
          const [questions, progress] = await Promise.all([getQuestions(db, bank.id), getProgress(db, bank.id)]);
          data = { session, bank, questions, progress };
        }
      } catch {
        data = null;
      }
      if (!cancelled) setState({ id, data, done: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  const listLink = (
    <Link href="/dashboard/student/assistant" className={btnQuiet}>
      {t('assistant.back_to_list')}
    </Link>
  );

  if (failed) {
    return (
      <div role="alert" className="flex gap-3 items-start bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p>{t('assistant.db_error')}</p>
      </div>
    );
  }
  if (!id) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700">{t('assistant.session_missing')}</p>
        {listLink}
      </div>
    );
  }
  if (!db || !state.done || state.id !== id) {
    return <div className="h-24 bg-slate-200 rounded-xl animate-pulse" aria-busy="true" aria-label={t('assistant.loading')} />;
  }
  if (!state.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700">{t('assistant.session_missing')}</p>
        {listLink}
      </div>
    );
  }

  return (
    <SessionView
      key={id}
      db={db}
      bank={state.data.bank}
      initial={state.data.session}
      questions={state.data.questions}
      initialProgress={state.data.progress}
    />
  );
}
