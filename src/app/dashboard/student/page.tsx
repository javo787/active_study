'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam, Attempt } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { formatTimeLeft, toMillis } from '@/lib/time';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const lastFetchTimeRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const examsQ = query(collection(db, 'exams'), where('isPublished', '==', true));
      const examsSnap = await getDocs(examsQ);
      const now = Date.now();

      const loadedExams = examsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Exam))
        .filter(exam => {
          if (exam.visibility === 'link') return false;
          const expMs = toMillis(exam.expiresAt);
          if (expMs && expMs <= now) return false;
          return true;
        });

      const attemptsQ = query(collection(db, 'attempts'), where('studentId', '==', user.uid));
      const attemptsSnap = await getDocs(attemptsQ);
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
    } finally {
      setLoading(false);
    }
  }, [user]);

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

  const filteredExams = exams.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const completedAttempts = Object.values(attempts)
    .filter(a => a.status === 'completed')
    .sort((a, b) => (toMillis(b.finishedAt) || 0) - (toMillis(a.finishedAt) || 0));

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

        {filteredExams.length === 0 ? (
          <p className="text-slate-500">No exams available at the moment.</p>
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

      {completedAttempts.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">My Results</h2>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {completedAttempts.map(attempt => {
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
                        {passed !== null && (
                          <span className={`px-2 py-1 text-xs font-bold rounded ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {passed ? 'PASS' : 'FAIL'}
                          </span>
                        )}
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
    </div>
  );
}
