'use client';

import { useEffect, useRef, useState } from 'react';
import { tgClearLog, tgFormatLog, tgGetLog, tgSubscribe } from '@/lib/tgLog';

/**
 * Copyable log of the Telegram sign-in steps, for phones where DevTools are not available.
 * Shows itself after a Telegram error, or always with ?debug=1 in the URL.
 */
export default function TelegramDiagnostics() {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  const [debugParam, setDebugParam] = useState(false);
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDebugParam(new URLSearchParams(window.location.search).get('debug') === '1');
    return tgSubscribe(() => force(n => n + 1));
  }, []);

  const entries = tgGetLog();
  const hasError = entries.some(e => e.level === 'error');
  if (!debugParam && !hasError) return null;

  const copy = async () => {
    const text = tgFormatLog();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable: select the text so the user can copy it by hand.
      areaRef.current?.focus();
      areaRef.current?.select();
    }
  };

  return (
    <div className="mt-4 text-left text-xs">
      <button type="button" onClick={() => setOpen(o => !o)} className="underline text-slate-500 hover:text-slate-700 min-h-[44px]">
        {open ? 'Hide diagnostics' : `Diagnostics (${entries.length})`}
        {hasError ? ' – errors found' : ''}
      </button>
      {open && (
        <div className="space-y-2">
          <textarea
            ref={areaRef}
            readOnly
            value={tgFormatLog()}
            className="w-full h-64 font-mono text-[11px] leading-snug p-2 border border-slate-300 rounded-md bg-slate-50 text-slate-800"
          />
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="px-3 py-2 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 min-h-[44px]">
              {copied ? 'Copied' : 'Copy log'}
            </button>
            <button type="button" onClick={tgClearLog} className="px-3 py-2 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 min-h-[44px]">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
