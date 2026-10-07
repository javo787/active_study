'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { btnPrimary, btnQuiet, field, fieldLabel } from '@/components/ui/styles';
import Modal from './Modal';
import {
  RANDOM_COUNTS,
  TIME_LIMITS_MIN,
  countAvailable,
  defaultConfig,
  validateConfig,
} from '../engine';
import type { AssistBank, AssistQuestion, QuestionProgress, QuestionScope, SessionConfig, SessionMode } from '../types';

interface Props {
  bank: AssistBank;
  mode: SessionMode;
  questions: AssistQuestion[];
  progress: ReadonlyMap<string, QuestionProgress>;
  starting: boolean;
  onClose: () => void;
  onStart: (config: SessionConfig) => void;
}

const SCOPES: QuestionScope[] = ['all', 'random', 'range'];

export default function StartDialog({ bank, mode, questions, progress, starting, onClose, onStart }: Props) {
  const { t } = useTranslation();
  const total = questions.length;
  const [config, setConfig] = useState<SessionConfig>(() => defaultConfig(total));
  // The inputs are text so that the student can clear them while typing; the number is read on every change.
  const [rangeFrom, setRangeFrom] = useState('1');
  const [rangeTo, setRangeTo] = useState(String(Math.max(1, total)));

  useEffect(() => {
    setConfig(c => ({ ...c, rangeFrom: Number(rangeFrom), rangeTo: Number(rangeTo) }));
  }, [rangeFrom, rangeTo]);

  const available = useMemo(() => countAvailable(questions, progress, config), [questions, progress, config]);
  const problem = validateConfig(config, total, available);

  const update = (patch: Partial<SessionConfig>) => setConfig(c => ({ ...c, ...patch }));

  const problemText =
    problem === 'range-invalid'
      ? t('assistant.problem_range', { max: total })
      : problem === 'random-invalid'
        ? t('assistant.problem_random')
        : problem === 'nothing-selected'
          ? t('assistant.problem_none')
          : null;

  const check = (label: string, key: 'shuffleQuestions' | 'shuffleAnswers' | 'onlyNew' | 'onlyWrong' | 'onlyStarred') => (
    <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
      <input
        type="checkbox"
        checked={config[key]}
        onChange={e => update({ [key]: e.target.checked })}
        className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-slate-800">{label}</span>
    </label>
  );

  return (
    <Modal
      title={`${mode === 'exam' ? t('assistant.start_exam') : t('assistant.start_training')}: ${bank.title}`}
      closeLabel={t('assistant.close')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnQuiet} onClick={onClose} disabled={starting}>
            {t('assistant.cancel')}
          </button>
          <button type="button" className={btnPrimary} onClick={() => onStart(config)} disabled={starting || problem !== null}>
            {t('assistant.start')}
          </button>
        </>
      }
    >
      <fieldset className="space-y-1">
        <legend className="sr-only">{t('assistant.scope_all')}</legend>
        {SCOPES.map(scope => (
          <div key={scope}>
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={config.scope === scope}
                onChange={() => update({ scope })}
                className="h-5 w-5 border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-800">{t(`assistant.scope_${scope}`)}</span>
            </label>

            {scope === 'random' && config.scope === 'random' && (
              <div className="ml-8 mb-2">
                <select
                  aria-label={t('assistant.scope_random')}
                  className={field}
                  value={config.randomCount}
                  onChange={e => update({ randomCount: Number(e.target.value) })}
                >
                  {Array.from(new Set([...RANDOM_COUNTS.filter(n => n < total), total])).map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scope === 'range' && config.scope === 'range' && (
              <div className="ml-8 mb-2 grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabel} htmlFor="range-from">
                    {t('assistant.from')}
                  </label>
                  <input id="range-from" className={field} inputMode="numeric" value={rangeFrom} onChange={e => setRangeFrom(e.target.value.replace(/\D/g, ''))} />
                </div>
                <div>
                  <label className={fieldLabel} htmlFor="range-to">
                    {t('assistant.to')}
                  </label>
                  <input id="range-to" className={field} inputMode="numeric" value={rangeTo} onChange={e => setRangeTo(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
            )}
          </div>
        ))}
      </fieldset>

      <div className="mt-4">
        <label className={fieldLabel} htmlFor="time-limit">
          {t('assistant.time_limit')}
        </label>
        <select
          id="time-limit"
          className={field}
          value={config.timeLimitMin ?? ''}
          onChange={e => update({ timeLimitMin: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">{t('assistant.time_none')}</option>
          {TIME_LIMITS_MIN.map(m => (
            <option key={m} value={m}>
              {t('assistant.minutes', { n: m })}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-slate-900 mb-1">{t('assistant.filters')}</legend>
        {check(t('assistant.shuffle_questions'), 'shuffleQuestions')}
        {check(t('assistant.shuffle_answers'), 'shuffleAnswers')}
        {check(t('assistant.only_new'), 'onlyNew')}
        {check(t('assistant.only_wrong'), 'onlyWrong')}
        {check(t('assistant.only_starred'), 'onlyStarred')}
        <p className="text-xs text-slate-500 mt-1">{t('assistant.filters_hint')}</p>
      </fieldset>

      <p role="status" className={`mt-4 text-sm font-medium ${problemText ? 'text-red-700' : 'text-slate-700'}`}>
        {problemText ?? t('assistant.selected', { n: available })}
      </p>
    </Modal>
  );
}
