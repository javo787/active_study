interface ResultBarProps {
  /** 0-100 */
  percent: number;
  /** Where the pass line is, if the exam has one. Drawn as a tick, like the reference range on a lab sheet. */
  passingPercent?: number | null;
}

/** A score against its pass line: fill reaches the tick (green) or stops short of it (orange). */
export function ResultBar({ percent, passingPercent }: ResultBarProps) {
  const value = Math.max(0, Math.min(100, percent));
  const hasLine = passingPercent !== undefined && passingPercent !== null;
  const reached = hasLine ? value >= (passingPercent as number) : null;
  const fill = reached === null ? 'bg-slate-500' : reached ? 'bg-pass' : 'bg-short';
  const description = hasLine
    ? `${value}%, pass line ${passingPercent}%, ${reached ? 'reached' : 'not reached'}`
    : `${value}%`;

  return (
    <div role="img" aria-label={description} className="relative h-1.5 w-full min-w-[72px] rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${value}%` }} />
      {hasLine && (
        <span
          aria-hidden="true"
          className="absolute -top-[3px] h-3 w-0.5 rounded-sm bg-ink"
          style={{ left: `calc(${passingPercent}% - 1px)` }}
        />
      )}
    </div>
  );
}
