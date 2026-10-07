'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Wider panel for the import preview. */
  wide?: boolean;
}

/**
 * A plain accessible dialog: Escape and a click on the backdrop close it, focus moves into it when it opens and goes
 * back to where it came from when it closes. On a phone it sits at the bottom like a sheet.
 */
export default function Modal({ title, onClose, closeLabel, children, footer, wide }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Parents pass inline callbacks: keep the latest in a ref so the effect below runs once, not on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-xl shadow-xl outline-none`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-200">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 break-words min-w-0">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="shrink-0 -mr-2 -mt-1 w-11 h-11 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
