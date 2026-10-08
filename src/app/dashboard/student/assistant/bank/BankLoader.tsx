'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { btnQuiet } from '@/components/ui/styles';
import { useAssistDb } from '@/features/assistant/useAssistDb';
import { getBank, getProgress, getQuestions } from '@/features/assistant/db';
import ViewScreen from '@/features/assistant/components/ViewScreen';
import type { AssistBank, AssistQuestion, QuestionProgress } from '@/features/assistant/types';

interface Loaded {
  bank: AssistBank;
  questions: AssistQuestion[];
  progress: Map<string, QuestionProgress>;
}

/** Reads one bank (questions and progress) from the local database, then hands over to the View screen. */
export default function BankLoader() {
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
        const bank = await getBank(db, id);
        if (bank) {
          const [questions, progress] = await Promise.all([getQuestions(db, id), getProgress(db, id)]);
          data = { bank, questions, progress };
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

  const back = (
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
  if (!id || (state.done && state.id === id && !state.data)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700">{t('assistant.bank_missing')}</p>
        {back}
      </div>
    );
  }
  if (!db || !state.done || state.id !== id || !state.data) {
    return <div className="h-24 bg-slate-200 rounded-xl animate-pulse" aria-busy="true" aria-label={t('assistant.loading')} />;
  }

  return <ViewScreen key={id} db={db} bank={state.data.bank} questions={state.data.questions} initialProgress={state.data.progress} />;
}
