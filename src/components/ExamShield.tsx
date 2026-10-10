'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import type { GuardReason } from '@/lib/examGuard';

/**
 * Covers the whole screen while the exam must not be seen: the window is split or small, another window is on top,
 * the page is hidden, a screenshot or print key was pressed. The questions are not drawn behind it (the exam is
 * hidden by the parent as well), so a screenshot taken meanwhile shows only this.
 */
export default function ExamShield({ reason, onResume }: { reason: GuardReason | null; onResume: () => void }) {
  const { t } = useTranslation();
  const key = reason ?? 'left_exam_area';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="exam-shield-title"
      aria-describedby="exam-shield-text"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900 p-6 text-center text-white"
    >
      <div className="w-full max-w-sm">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-amber-400" aria-hidden="true" />
        <h2 id="exam-shield-title" className="mb-2 text-xl font-bold">{t('examGuard.title')}</h2>
        <p id="exam-shield-text" className="mb-2 text-base text-slate-200">{t(`examGuard.${key}`)}</p>
        <p className="mb-6 text-sm text-slate-400">{t('examGuard.recorded')}</p>
        <button
          type="button"
          onClick={onResume}
          className="min-h-[44px] w-full rounded-md bg-white px-4 py-3 font-semibold text-slate-900 hover:bg-slate-100"
        >
          {t('examGuard.resume')}
        </button>
      </div>
    </div>
  );
}
