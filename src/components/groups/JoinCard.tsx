'use client';

import { JoinPreview, JoinRefusal, refusalMessage } from '@/lib/groups';

interface JoinCardProps {
  preview: JoinPreview;
  joining: boolean;
  onJoin: () => void;
  /** Dismiss without joining. */
  onCancel: () => void;
  cancelLabel?: string;
}

const buttonBase = 'px-4 py-2 rounded-md min-h-[44px] text-sm font-medium';

/** Shows which group a code leads to before anyone joins it, and says plainly when joining is not possible. */
export function JoinCard({ preview, joining, onJoin, onCancel, cancelLabel = 'Cancel' }: JoinCardProps) {
  const { group, status } = preview;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3" aria-live="polite">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Group</p>
        <h3 className="text-lg font-semibold text-slate-900">{group.name}</h3>
        {group.ownerName && <p className="text-sm text-slate-600">Teacher: {group.ownerName}</p>}
        {group.description && <p className="text-sm text-slate-500 mt-0.5">{group.description}</p>}
      </div>

      {status === 'joinable' && (
        <>
          <p className="text-sm text-slate-600">After you join, the exams of this group appear on your dashboard.</p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button type="button" onClick={onCancel} disabled={joining} className={`${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50`}>
              {cancelLabel}
            </button>
            <button type="button" onClick={onJoin} disabled={joining} className={`${buttonBase} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>
              {joining ? 'Joining...' : `Join ${group.name}`}
            </button>
          </div>
        </>
      )}

      {status === 'member' && (
        <>
          <p className="text-sm text-slate-700" role="status">You are already in this group.</p>
          <button type="button" onClick={onCancel} className={`${buttonBase} bg-blue-600 text-white hover:bg-blue-700`}>
            {cancelLabel === 'Cancel' ? 'Close' : cancelLabel}
          </button>
        </>
      )}

      {status !== 'joinable' && status !== 'member' && (
        <>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3" role="alert">
            {refusalMessage(status as JoinRefusal)}
          </p>
          <button type="button" onClick={onCancel} className={`${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            {cancelLabel === 'Cancel' ? 'Close' : cancelLabel}
          </button>
        </>
      )}
    </div>
  );
}
