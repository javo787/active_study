'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { openAssistDb, type AssistIDB } from './db';

/**
 * The signed-in student's local database. `db` is null while it opens; `failed` is true when the browser refuses
 * (some private modes). It opens one connection per page and closes it on leaving.
 */
export function useAssistDb(): { db: AssistIDB | null; failed: boolean } {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<{ uid: string; db: AssistIDB } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let opened: AssistIDB | null = null;
    openAssistDb(uid)
      .then(db => {
        if (cancelled) {
          db.close();
          return;
        }
        opened = db;
        setState({ uid, db });
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [uid]);

  return { db: state && state.uid === uid ? state.db : null, failed };
}
