'use client';

import { useTranslation } from 'react-i18next';
import { btnPrimary } from '@/components/ui/styles';
import Modal from './Modal';
import type { AssistBank, BankStats } from '../types';

interface Props {
  bank: AssistBank;
  stats: BankStats;
  onClose: () => void;
}

export default function InfoDialog({ bank, stats, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const percent = Math.min(100, Math.max(0, stats.percentCorrect));
  const wrongPercent = stats.total === 0 ? 0 : Math.min(100 - percent, (stats.wrong / stats.total) * 100);
  const added = new Date(bank.createdAt).toLocaleDateString(i18n.language === 'tj' ? 'tg' : i18n.language);

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 text-right break-words min-w-0">{value}</dd>
    </div>
  );

  return (
    <Modal
      title={t('assistant.info_title')}
      closeLabel={t('assistant.close')}
      onClose={onClose}
      footer={
        <button type="button" className={btnPrimary} onClick={onClose}>
          {t('assistant.filter_done')}
        </button>
      }
    >
      <p className="font-semibold text-slate-900 break-words">{bank.title}</p>

      <dl className="mt-2">
        {row(t('assistant.info_mode'), t(`assistant.mode_${bank.mode}`))}
        {row(t('assistant.questions_list'), String(bank.questionCount))}
        {bank.sourceName ? row(t('assistant.info_source'), bank.sourceName) : null}
        {row(t('assistant.info_added'), added)}
      </dl>

      <p className="mt-4 text-sm font-medium text-slate-900">{t('assistant.info_progress')}</p>
      <div
        className="mt-2 flex h-2 rounded-full bg-slate-200 overflow-hidden"
        role="img"
        aria-label={t('assistant.progress', { done: stats.correct, total: stats.total, percent: stats.percentCorrect.toFixed(2) })}
      >
        <div className="bg-emerald-500" style={{ width: `${percent}%` }} />
        <div className="bg-red-400" style={{ width: `${wrongPercent}%` }} />
      </div>
      <p className="mt-2 text-sm text-slate-700">
        {t('assistant.progress', { done: stats.correct, total: stats.total, percent: stats.percentCorrect.toFixed(2) })}
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700">
        <li className="text-emerald-700">{t('assistant.stat_correct', { n: stats.correct })}</li>
        <li className="text-red-700">{t('assistant.stat_wrong', { n: stats.wrong })}</li>
        <li>{t('assistant.stat_new', { n: stats.fresh })}</li>
        <li>{t('assistant.stat_starred', { n: stats.starred })}</li>
      </ul>
    </Modal>
  );
}
