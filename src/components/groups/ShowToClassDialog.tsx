'use client';

import { useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import { formatJoinCode, inviteLink } from '@/lib/groups';

interface ShowToClassDialogProps {
  groupName: string;
  code: string;
  onClose: () => void;
}

/** Full-screen code and QR for the projector: students scan it or type the code. */
export function ShowToClassDialog({ groupName, code, onClose }: ShowToClassDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-6 p-6 text-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="show-class-title"
    >
      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 p-3 rounded-full text-slate-500 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <X className="w-6 h-6" />
      </button>

      <h2 id="show-class-title" className="text-2xl sm:text-3xl font-bold text-slate-800">{groupName}</h2>
      <p className="text-slate-500">Scan the code with your phone, or open Duxtur Edu and type the join code.</p>

      {/* Black on white and a quiet zone: the most reliable thing for a phone camera across a classroom. */}
      <div className="bg-white p-4 border border-slate-200 rounded-xl">
        <QRCodeSVG value={inviteLink(code)} size={256} level="M" bgColor="#ffffff" fgColor="#000000" title={`Invite link for ${groupName}`} />
      </div>

      <p className="font-mono text-5xl sm:text-7xl tracking-widest text-slate-900" aria-label={`Join code ${code.split('').join(' ')}`}>
        {formatJoinCode(code)}
      </p>
    </div>
  );
}
