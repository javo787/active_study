'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Group } from '@/types';
import {
  JoinGroupError,
  JoinPreview,
  clearPendingJoinCode,
  extractJoinCode,
  isValidJoinCode,
  previewJoin,
  savePendingJoinCode,
} from '@/lib/groups';
import { JoinCard } from '@/components/groups/JoinCard';

export default function JoinClient() {
  const { user, loading, joinGroup } = useAuth();
  const router = useRouter();
  const code = extractJoinCode(useSearchParams().get('code') || '');
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [joined, setJoined] = useState<Group | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const valid = isValidJoinCode(code);

  useEffect(() => {
    if (loading || !valid) return;
    if (!user) {
      // Remember the code across the sign-in (Google popup / Telegram); the dashboard shows the same card afterwards.
      savePendingJoinCode(code);
      return;
    }
    if (user.role !== 'student' || started.current) return;
    started.current = true;
    // This page shows the card now, so the dashboard must not show it a second time.
    clearPendingJoinCode();

    previewJoin({ uid: user.uid, name: user.fullName || user.displayName, groupIds: user.groupIds }, code)
      .then(setPreview)
      .catch(err => setError(err instanceof JoinGroupError ? err.message : 'Could not look the code up. Check your connection and try again.'));
  }, [loading, user, code, valid]);

  const confirmJoin = async () => {
    setJoining(true);
    try {
      setJoined(await joinGroup(code));
      setPreview(null);
    } catch (err) {
      setPreview(null);
      setError(err instanceof JoinGroupError ? err.message : 'Could not join the group. Try again.');
    } finally {
      setJoining(false);
    }
  };

  let body: React.ReactNode;
  if (!valid) {
    body = (
      <p className="text-red-600" role="alert">
        This invite link is not valid. Ask your teacher for a new one.
      </p>
    );
  } else if (loading) {
    body = <div className="mx-auto animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" role="status" aria-label="Loading" />;
  } else if (!user) {
    body = (
      <>
        <p className="text-slate-600">You have been invited to join a class group. Sign in to see which group it is.</p>
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
  } else if (joined) {
    body = (
      <>
        <p className="text-slate-700" role="status">
          You joined <strong>{joined.name}</strong>.
        </p>
        <Link href="/dashboard/student" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 min-h-[44px]">
          Go to my exams
        </Link>
      </>
    );
  } else if (error) {
    body = (
      <>
        <p className="text-red-600" role="alert">{error}</p>
        <Link href="/dashboard/student" className="text-blue-600 underline">
          Go to dashboard
        </Link>
      </>
    );
  } else if (preview) {
    body = (
      <div className="text-left">
        <JoinCard
          preview={preview}
          joining={joining}
          onJoin={confirmJoin}
          onCancel={() => router.push('/dashboard/student')}
          cancelLabel="Not now"
        />
      </div>
    );
  } else {
    body = (
      <>
        <div className="mx-auto animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" role="status" aria-label="Looking the group up" />
        <p className="text-slate-600">Looking the group up...</p>
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
