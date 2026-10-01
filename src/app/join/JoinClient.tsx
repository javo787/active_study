'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import {
  JoinGroupError,
  clearPendingJoinCode,
  isValidJoinCode,
  normalizeJoinCode,
  savePendingJoinCode,
} from '@/lib/groups';

export default function JoinClient() {
  const { user, loading, joinGroup } = useAuth();
  const router = useRouter();
  const code = normalizeJoinCode(useSearchParams().get('code') || '');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const valid = isValidJoinCode(code);

  useEffect(() => {
    if (loading || !valid) return;
    if (!user) {
      // Remember the code across the sign-in (Google popup / Telegram).
      savePendingJoinCode(code);
      return;
    }
    if (user.role !== 'student' || started.current) return;
    started.current = true;

    joinGroup(code)
      .then(() => {
        clearPendingJoinCode();
        router.replace('/dashboard/student');
      })
      .catch(err => {
        clearPendingJoinCode();
        setError(err instanceof JoinGroupError ? err.message : 'Could not join the group');
      });
  }, [loading, user, code, valid, joinGroup, router]);

  let body: React.ReactNode;
  if (!valid) {
    body = <p className="text-red-600">This invite link is not valid. Ask your teacher for a new one.</p>;
  } else if (loading) {
    body = <div className="mx-auto animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />;
  } else if (!user) {
    body = (
      <>
        <p className="text-slate-600">You have been invited to join a class group. Sign in to continue.</p>
        <Link href="/" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 min-h-[44px]">
          Sign in
        </Link>
      </>
    );
  } else if (user.role !== 'student') {
    body = (
      <>
        <p className="text-slate-600">Only student accounts can join groups.</p>
        <Link href={`/dashboard/${user.role}`} className="text-blue-600 underline">
          Back to dashboard
        </Link>
      </>
    );
  } else if (error) {
    body = (
      <>
        <p className="text-red-600">{error}</p>
        <Link href="/dashboard/student" className="text-blue-600 underline">
          Go to dashboard
        </Link>
      </>
    );
  } else {
    body = (
      <>
        <div className="mx-auto animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <p className="text-slate-600">Joining the group...</p>
      </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Join a group</h1>
        {body}
      </div>
    </div>
  );
}
