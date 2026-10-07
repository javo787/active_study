'use client';

import { useTranslation } from 'react-i18next';
import { Check, Heart, X } from 'lucide-react';
import { correctIds, questionKind } from '../engine';
import type { AssistQuestion } from '../types';

/** answering = the student is choosing; checked = shown after "Check"; review = the results screen. */
export type CardState = 'answering' | 'checked' | 'review';

interface Props {
  question: AssistQuestion;
  /** Option ids in the order they are shown. */
  optionIds: readonly string[];
  selected: readonly string[];
  state: CardState;
  number: number;
  starred?: boolean;
  onToggleOption?: (optionId: string) => void;
  onToggleStar?: () => void;
}

function rowClass(state: CardState, isSelected: boolean, isCorrect: boolean): string {
  if (state === 'answering') {
    return isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50';
  }
  if (isCorrect) return isSelected ? 'border-emerald-600 bg-emerald-100' : 'border-emerald-600 border-dashed bg-emerald-50';
  return isSelected ? 'border-red-500 bg-red-50' : 'border-slate-200 text-slate-600';
}

export default function QuestionCard({ question, optionIds, selected, state, number, starred, onToggleOption, onToggleStar }: Props) {
  const { t } = useTranslation();
  const kind = questionKind(question);
  const locked = state !== 'answering';
  const chosen = new Set(selected);
  const byId = new Map(question.options.map(o => [o.id, o]));

  return (
    <fieldset className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <legend className="text-base sm:text-lg font-medium text-slate-900 break-words min-w-0">
          <span className="text-slate-400 mr-1">#{number}</span>
          {question.text}
        </legend>
        {onToggleStar && (
          <button
            type="button"
            onClick={onToggleStar}
            aria-pressed={!!starred}
            aria-label={starred ? t('assistant.unstar') : t('assistant.star')}
            className="shrink-0 -mr-2 -mt-2 w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Heart className={`w-6 h-6 ${starred ? 'fill-red-500 text-red-500' : 'text-slate-400'}`} aria-hidden="true" />
          </button>
        )}
      </div>

      {kind === 'multiple' && state === 'answering' && (
        <p className="mt-2 text-sm text-slate-500">{t('assistant.select_n', { n: correctIds(question).length })}</p>
      )}

      <div className="mt-4 space-y-2">
        {optionIds.map(id => {
          const option = byId.get(id);
          if (!option) return null;
          const isSelected = chosen.has(id);
          return (
            <label
              key={id}
              className={`flex items-start gap-3 rounded-lg border-2 px-3 py-3 min-h-[48px] focus-within:ring-2 focus-within:ring-blue-500 ${
                locked ? 'cursor-default' : 'cursor-pointer'
              } ${rowClass(state, isSelected, option.correct)}`}
            >
              <input
                type={kind === 'single' ? 'radio' : 'checkbox'}
                name={question.id}
                className="sr-only"
                checked={isSelected}
                disabled={locked}
                onChange={() => onToggleOption?.(id)}
              />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 ${kind === 'single' ? 'rounded-full' : 'rounded'} ${
                  locked && option.correct
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : locked && isSelected
                      ? 'border-red-500 bg-red-500 text-white'
                      : isSelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-400'
                }`}
              >
                {locked && !option.correct && isSelected ? (
                  <X className="w-3.5 h-3.5" />
                ) : isSelected || (locked && option.correct) ? (
                  <Check className="w-3.5 h-3.5" />
                ) : null}
              </span>
              <span className="text-sm sm:text-base text-slate-900 break-words min-w-0">
                {option.text}
                {locked && option.correct && <span className="sr-only"> ({t('assistant.correct_answer')})</span>}
                {locked && !option.correct && isSelected && <span className="sr-only"> ({t('assistant.wrong')})</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
