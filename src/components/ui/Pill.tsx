import { ReactNode } from 'react';

export type PillTone = 'neutral' | 'good' | 'short' | 'flag' | 'info' | 'warn';

const TONES: Record<PillTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  good: { box: 'bg-emerald-50 text-emerald-800', dot: 'bg-pass' },
  short: { box: 'bg-orange-50 text-orange-800', dot: 'bg-short' },
  flag: { box: 'bg-red-50 text-red-800', dot: 'bg-flag' },
  info: { box: 'bg-blue-50 text-blue-800', dot: 'bg-blue-600' },
  warn: { box: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
};

interface PillProps {
  tone?: PillTone;
  children: ReactNode;
  /** A small status dot before the text; text always carries the meaning, colour only supports it. */
  dot?: boolean;
  className?: string;
}

export function Pill({ tone = 'neutral', children, dot = false, className = '' }: PillProps) {
  const t = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${t.box} ${className}`}>
      {dot && <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}
