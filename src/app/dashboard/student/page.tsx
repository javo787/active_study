'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { Exam, Attempt, Group } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { formatTimeLeft, toMillis } from '@/lib/time';
import {
  clearPendingJoinCode,
  chunk,
  fetchGroupsByIds,
  peekPendingJoinCode,
  reconcileMemberships,
} from '@/lib/groups';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { JoinByCode } from '@/components/groups/JoinByCode';
import { MyGroups } from '@/components/groups/MyGroups';

// Firestore allows at most 30 values in array-contains-any.
const IN_CHUNK = 30;

export default function StudentDashboard() {
  const { user, leaveGroup, pruneGroups } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupToLeave, setGroupToLeave] = useState<Group | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  // A code remembered from an invite link opened before signing in: shown as a confirmation card, never joined silently.
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const pendingHandledRef = useRef(false);
  const pruningRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const groupIds = user.groupIds ?? [];

      const { groups: myGroups, missingIds } = await fetchGroupsByIds(groupIds);

      if (missingIds.length > 0 && !pruningRef.current) {
        pruningRef.current = true;
        pruneGroups(missingIds).catch(console.error);
        toast(`${missingIds.length} group(s) you were in no longer exist. They were deleted by the teacher.`, { icon: 'ℹ️' });
      }

      // Groups the owner removed this student from are dropped here: the owner cannot edit a student's profile.
      const { removedIds } = await reconcileMemberships(
        { uid: user.uid, name: user.fullName || user.displayName },
        myGroups,
      );
      if (removedIds.length > 0) {
        pruneGroups(removedIds).catch(console.error);
        toast(`You were removed from ${removedIds.length} group(s) by the teacher.`, { icon: 'ℹ️' });
      }

      const keptGroups = myGroups.filter(g => !removedIds.includes(g.id));
      // Only ids that are certainly gone (deleted, or the owner removed this student) are dropped.
      // A group whose lookup failed (network) stays in the query.
      const validGroupIds = groupIds.filter(id => !missingIds.includes(id) && !removedIds.includes(id));

      const attemptsQ = query(collection(db, 'attempts'), where('studentId', '==', user.uid));
      const now = Date.now();

      // Only exams assigned to the student's valid groups, never the whole catalogue.
      const examSnaps = await Promise.all(
        chunk(validGroupIds, IN_CHUNK).map(ids =>
          getDocs(query(
            collection(db, 'exams'),
            where('isPublished', '==', true),
            where('groupIds', 'array-contains-any', ids),
          ))
        )
      );

      const attemptsSnap = await getDocs(attemptsQ);

      const seen = new Set<string>();
      const loadedExams = examSnaps
        .flatMap(snap => snap.docs)
        .map(doc => ({ id: doc.id, ...doc.data() } as Exam))
        .filter(exam => {
          if (seen.has(exam.id)) return false;
          seen.add(exam.id);
          if (exam.visibility === 'link') return false;
          const expMs = toMillis(exam.expiresAt);
          if (expMs && expMs <= now) return false;
          return true;
        });
      setGroups(keptGroups);
      const attemptsMap: Record<string, Attempt> = {};

      attemptsSnap.docs.forEach(doc => {
        const attempt = { id: doc.id, ...doc.data() } as Attempt;
        const expMs = toMillis(attempt.expiresAt);
        if (expMs && expMs <= now) return;
        attemptsMap[attempt.examId] = attempt;
      });

      setExams(loadedExams);
      setAttempts(attemptsMap);
      lastFetchTimeRef.current = Date.now();
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user, pruneGroups]);

  // An invite link opened before sign-in leaves its code in localStorage.
  useEffect(() => {
    if (!user || user.role !== 'student' || pendingHandledRef.current) return;
    const code = peekPendingJoinCode();
    if (!code) return;
    pendingHandledRef.current = true;
    clearPendingJoinCode();
    setPendingCode(code);
  }, [user]);

  const handleLeave = async () => {
    if (!groupToLeave) return;
    try {
      await leaveGroup(groupToLeave.id);
      if (groupFilter === groupToLeave.id) setGroupFilter(null);
      setGroupToLeave(null);
    } catch {
      toast.error('Could not leave the group');
    }
  };

  useEffect(() => {
    fetchData();
    const handleFocus = () => {
      if (Date.now() - lastFetchTimeRef.current > 60000) {
        fetchData();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchData]);

  const examGroupNames = (exam: Exam) =>
    groups.filter(g => exam.groupIds?.includes(g.id)).map(g => g.name).join(', ');

  const filteredExams = exams
    .filter(e => !groupFilter || e.groupIds?.includes(groupFilter))
    .filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredGroup = groupFilter ? groups.find(g => g.id === groupFilter) : undefined;
  const pastAttempts = Object.values(attempts)
    .filter(a => a.status === 'completed' || a.status === 'flagged')
    .sort((a, b) => (toMillis(b.finishedAt) || 0) - (toMillis(a.finishedAt) || 0));

  if (error) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-slate-600">Could not load your dashboard. Please check your connection.</p>
        <button
          onClick={fetchData}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-h-[44px]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (loading && exams.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-slate-200 rounded-lg"></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <JoinByCode initialCode={pendingCode} />

      <MyGroups groups={groups} exams={exams} activeGroupId={groupFilter} onFilter={setGroupFilter} onLeave={setGroupToLeave} />

      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold text-slate-800">Available Exams</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            {exams.length > 4 && (
              <input
                type="text"
                placeholder="Search exams..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-md min-h-[44px] w-full sm:w-64"
              />
            )}
            <button onClick={fetchData} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md min-h-[44px] hover:bg-slate-300">
              Refresh
            </button>
          </div>
        </div>

        {filteredGroup && (
          <div className="flex items-center justify-between gap-3 mb-4 rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-900">
            <span>Showing the exams of {filteredGroup.name}</span>
            <button type="button" onClick={() => setGroupFilter(null)} className="font-medium underline min-h-[44px] px-2">Show all</button>
          </div>
        )}

        {filteredExams.length === 0 ? (
          <p className="text-slate-500">
            {groups.length === 0
              ? 'Join a group with the code from your teacher to see your exams.'
              : 'No exams available at the moment.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredExams.map(exam => {
              const attempt = attempts[exam.id];
              let statusText = 'Start';
              let btnClass = 'bg-blue-600 hover:bg-blue-700 text-white';
              let disabled = false;

              if (attempt?.status === 'in_progress') {
                statusText = 'Resume';
                btnClass = 'bg-amber-500 hover:bg-amber-600 text-white';
              } else if (attempt?.status === 'completed') {
                statusText = 'View result';
                btnClass = 'bg-slate-200 hover:bg-slate-300 text-slate-800';
              } else if (attempt?.status === 'flagged') {
                statusText = 'Ask your teacher';
                btnClass = 'bg-slate-100 text-slate-400';
                disabled = true;
              }

              return (
                <div key={exam.id} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex flex-col">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-800 mb-1 line-clamp-1">{exam.title}</h3>
                    <p className="text-slate-500 text-sm mb-4 line-clamp-2 min-h-[40px]">
                      {exam.description || 'No description provided.'}
                    </p>
                    {examGroupNames(exam) && (
                      <p className="text-xs text-slate-400 -mt-2 mb-3 line-clamp-1">{examGroupNames(exam)}</p>
                    )}
                    <div className="space-y-1 mb-6 text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span>Time Limit:</span>
                        <span className="font-medium">{exam.timeLimit} mins</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Expires:</span>
                        <span className="font-medium text-amber-600">{formatTimeLeft(exam.expiresAt)}</span>
                      </div>
                      {attempt?.status && (
                        <div className="flex justify-between mt-2 pt-2 border-t border-slate-100">
                          <span>Status:</span>
                          <span className="font-medium capitalize">{attempt.status.replace('_', ' ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/exam?id=${exam.id}`}
                    className={`block w-full text-center py-3 px-4 rounded-md font-medium min-h-[44px] transition-colors ${btnClass} ${disabled ? 'pointer-events-none' : ''}`}
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : undefined}
                  >
                    {statusText}
                    {attempt?.status === 'completed' && attempt.score !== undefined && (
                      <span className="ml-2">({attempt.score}/{attempt.totalQuestions})</span>
                    )}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pastAttempts.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">My Results</h2>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {pastAttempts.map(attempt => {
                const percent = attempt.totalQuestions ? Math.round((attempt.score! / attempt.totalQuestions) * 100) : 0;
                const passed = attempt.passingPercent !== null && attempt.passingPercent !== undefined ? percent >= attempt.passingPercent : null;

                return (
                  <li key={attempt.id}>
                    <Link href={`/exam?id=${attempt.examId}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 transition-colors min-h-[60px] gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{attempt.examTitle || 'Unknown Exam'}</p>
                        <p className="text-xs text-slate-500">
                          {attempt.finishedAt ? new Date(toMillis(attempt.finishedAt)!).toLocaleString() : 'Completed'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 self-start sm:self-auto">
                        {attempt.status === 'flagged' ? (
                          <span className="px-2 py-1 text-xs font-bold rounded bg-amber-100 text-amber-700">STOPPED</span>
                        ) : passed !== null ? (
                          <span className={`px-2 py-1 text-xs font-bold rounded ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {passed ? 'PASS' : 'FAIL'}
                          </span>
                        ) : null}
                        <span className="font-medium text-slate-700">
                          {attempt.score}/{attempt.totalQuestions} <span className="text-slate-400">({percent}%)</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-xs text-slate-400 mt-2">Results are deleted automatically after 2 days.</p>
        </div>
      )}

      <ConfirmDialog
        isOpen={groupToLeave !== null}
        title="Leave Group"
        message="You will stop seeing exams assigned only to this group. You will need the code again to rejoin."
        isDestructive={true}
        confirmText="Leave"
        onConfirm={handleLeave}
        onCancel={() => setGroupToLeave(null)}
      />
    </div>
  );
}
