'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Heart } from 'lucide-react';
import { highlightSegments } from '../view';
import type { AssistQuestion, QuestionStatus } from '../types';

function Marked({ text, tokens }: { text: string; tokens: readonly string[] }) {
  const parts = highlightSegments(text, tokens);
  if (parts.length === 1 && !parts[0].marked) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.marked ? (
          <mark key={i} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

const BADGE: Record<QuestionStatus, string> = {
  new: 'bg-slate-100 text-slate-600 border-slate-200',
  correct: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wrong: 'bg-red-50 text-red-700 border-red-200',
};

interface Props {
  question: AssistQuestion;
  status: QuestionStatus;
  attempts: number;
  correctAttempts: number;
  starred: boolean;
  showAnswers: boolean;
  tokens: readonly string[];
  onToggleStar: (questionId: string) => void;
}

/** One question in the View list: the right answers highlighted, how the student did, a favourite heart. */
function ViewQuestionCardImpl({ question, status, attempts, correctAttempts, starred, showAnswers, tokens, onToggleStar }: Props) {
  const { t } = useTranslation();

  return (
    <li id={`q-${question.index}`} className="scroll-mt-44 bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-medium text-slate-900 break-words min-w-0">
            <span className="text-slate-400 mr-1">#{question.index}</span>
            <Marked text={question.text} tokens={tokens} />
          </h3>
          <button
            type="button"
            onClick={() => onToggleStar(question.id)}
            aria-pressed={starred}
            aria-label={starred ? t('assistant.unstar') : t('assistant.star')}
            className="shrink-0 -mr-2 -mt-2 w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Heart className={`w-6 h-6 ${starred ? 'fill-red-500 text-red-500' : 'text-slate-400'}`} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${BADGE[status]}`}>
            {t(`assistant.status_${status}`)}
          </span>
          {attempts > 0 && <span className="text-slate-500">{t('assistant.attempts', { n: attempts, ok: correctAttempts })}</span>}
        </p>
      </div>

      <ul className="border-t border-slate-100">
        {question.options.map(option => {
          const right = showAnswers && option.correct;
          return (
            <li
              key={option.id}
              className={`flex items-start gap-3 px-4 py-3 text-sm sm:text-base break-words ${
                right ? 'bg-emerald-100 text-emerald-950 border-l-4 border-emerald-600' : 'text-slate-800 border-l-4 border-transparent'
              }`}
            >
              <span aria-hidden="true" className="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center">
                {right ? <Check className="w-5 h-5 text-emerald-700" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
              </span>
              <span className="min-w-0">
                <Marked text={option.text} tokens={tokens} />
                {right && <span className="sr-only"> ({t('assistant.correct_answer')})</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

const ViewQuestionCard = memo(ViewQuestionCardImpl);
export default ViewQuestionCard;
