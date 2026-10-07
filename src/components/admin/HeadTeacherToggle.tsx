'use client';

import { useState } from 'react';

interface HeadTeacherToggleProps {
  on: boolean;
  /** Resolves when the change is saved; the toggle stays disabled until then. */
  onChange: (on: boolean) => Promise<void> | void;
}

/**
 * Admin only: makes a teacher the head teacher (the person who answers teacher requests), or takes it back.
 * It is a switch, so it reads as "on/off" to a screen reader and the label says what it controls.
 */
export function HeadTeacherToggle({ on, onChange }: HeadTeacherToggleProps) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await onChange(!on);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={toggle}
      className="mt-3 flex items-center gap-3 min-h-[44px] text-left text-sm text-slate-700 disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`relative inline-block w-10 h-6 rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`}
        />
      </span>
      <span>Head teacher (answers teacher requests)</span>
    </button>
  );
}
