'use client';

import { useEffect, useState } from 'react';
import { canAnswerRequests, countPendingRequests } from '@/lib/teacherRequests';
import { User } from '@/types';

/**
 * How many teacher requests wait for an answer, for the badge in the menu and the banner on the dashboard.
 * Only the people who may answer them ask; for everybody else it stays 0 and nothing is read.
 * `refreshKey` lets a page that just answered a request ask again.
 */
export function useRequestCount(user: Pick<User, 'role' | 'headTeacher'> | null, refreshKey = 0): number {
  const [count, setCount] = useState(0);
  const allowed = canAnswerRequests(user);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    countPendingRequests()
      .then(n => { if (alive) setCount(n); })
      .catch(() => { /* a badge is a hint: no badge is better than an error */ });
    return () => { alive = false; };
  }, [allowed, refreshKey]);

  return allowed ? count : 0;
}
