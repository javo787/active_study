'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Share } from 'lucide-react';
import { useInstallApp } from '@/hooks/useInstallApp';

/**
 * "Install the app": a button where the browser can install Duxtur Edu, the steps for "Add to Home Screen" on iPhone and
 * iPad, and nothing where installing is not possible or the app is already installed.
 */
export default function InstallApp({ variant = 'link' }: { variant?: 'link' | 'sidebar' }) {
  const { t } = useTranslation();
  const { mode, install } = useInstallApp();
  const [showSteps, setShowSteps] = useState(false);

  if (mode === 'hidden') return null;

  const style =
    variant === 'sidebar'
      ? 'w-full flex items-center gap-2 text-left px-4 py-2 min-h-[44px] rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium'
      : 'inline-flex items-center justify-center gap-2 min-h-[44px] px-3 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline underline-offset-2';

  return (
    <>
      <button
        type="button"
        onClick={() => (mode === 'prompt' ? void install() : setShowSteps(true))}
        className={style}
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('pwa.install', 'Install the app')}
      </button>
      {showSteps && <IosSteps onClose={() => setShowSteps(false)} />}
    </>
  );
}

function IosSteps({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-steps-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-left shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <h3 id="install-steps-title" className="mb-4 text-lg font-bold text-slate-800">
          {t('pwa.ios_title', 'Install on iPhone or iPad')}
        </h3>
        <ol className="mb-6 list-decimal space-y-3 pl-5 text-sm text-slate-700">
          <li>
            {t('pwa.ios_step1', 'Tap the Share button in Safari.')}{' '}
            <Share className="inline h-4 w-4 align-text-bottom text-blue-600" aria-hidden="true" />
          </li>
          <li>{t('pwa.ios_step2', 'Choose “Add to Home Screen”.')}</li>
          <li>{t('pwa.ios_step3', 'Tap Add. Duxtur Edu appears among your apps.')}</li>
        </ol>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="min-h-[44px] w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-800"
        >
          {t('pwa.got_it', 'Got it')}
        </button>
      </div>
    </div>
  );
}
