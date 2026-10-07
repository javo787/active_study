'use client';

import { useTranslation } from 'react-i18next';
import { CheckCircle2, ListChecks } from 'lucide-react';
import { surface } from '@/components/ui/styles';
import type { AssistBank, BankStats } from '../types';

interface Props {
  bank: AssistBank;
  stats: BankStats;
  hasOpenSession: boolean;
  onOpen: () => void;
}

export default function BankCard({ bank, stats, hasOpenSession, onOpen }: Props) {
  const { t } = useTranslation();
  const percent = Math.min(100, Math.max(0, stats.percentCorrect));
  const wrongPercent = stats.total === 0 ? 0 : Math.min(100 - percent, (stats.wrong / stats.total) * 100);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`${surface} w-full text-left overflow-hidden hover:border-slate-300 hover:shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600`}
      >
        <div
          className="flex h-1.5 bg-slate-200"
          role="img"
          aria-label={t('assistant.progress', { done: stats.correct, total: stats.total, percent: stats.percentCorrect.toFixed(2) })}
        >
          <div className="bg-emerald-500" style={{ width: `${percent}%` }} />
          <div className="bg-red-400" style={{ width: `${wrongPercent}%` }} />
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-slate-900 break-words">{bank.title}</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1">
              <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
              {t(`assistant.mode_${bank.mode}`)}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1">
              {t('assistant.questions_count', { n: bank.questionCount })}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              {t('assistant.progress', { done: stats.correct, total: stats.total, percent: stats.percentCorrect.toFixed(2) })}
            </span>
            {hasOpenSession && (
              <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 font-medium">
                {t('assistant.continue')}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
