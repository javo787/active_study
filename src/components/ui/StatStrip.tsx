import { ReactNode } from 'react';

export interface Stat {
  label: string;
  value: ReactNode;
  note?: string;
}

/** The numbers that matter, read left to right in one strip. Two columns on a phone, one row on a desktop. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 md:flex bg-white border border-slate-200 rounded-xl overflow-hidden">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={`flex-1 px-4 py-3 border-slate-200 ${i === stats.length - 1 && stats.length % 2 === 1 ? 'col-span-2 md:col-span-1' : ''} ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t' : ''} md:border-t-0 ${i > 0 ? 'md:border-l' : 'md:border-l-0'}`}
        >
          <dt className="text-sm text-slate-500">{stat.label}</dt>
          <dd className="text-2xl font-semibold tracking-tight text-ink tnum mt-0.5">{stat.value}</dd>
          {stat.note && <p className="text-xs text-slate-400 mt-0.5">{stat.note}</p>}
        </div>
      ))}
    </dl>
  );
}
