'use client';

import { useEffect, useState, Fragment } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Attempt, Question } from '@/types';
import { toast } from 'react-hot-toast';

function toDate(value: Date | { toDate: () => Date } | undefined | null): Date | null {
  if (!value) return null;
  return 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : (value as Date);
}

function formatDuration(start: Date | { toDate: () => Date } | undefined | null, end: Date | { toDate: () => Date } | undefined | null): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return '—';
  const seconds = Math.max(0, Math.round((e.getTime() - s.getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AttemptsDashboard() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questionDetails, setQuestionDetails] = useState<Record<string, Question[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        const attemptsSnap = await getDocs(collection(db, 'attempts'));
        const allAttempts = attemptsSnap.docs
          .map(d => ({ ...d.data(), id: d.id } as Attempt))
          .sort((a, b) => (toDate(b.startedAt)?.getTime() || 0) - (toDate(a.startedAt)?.getTime() || 0));
        setAttempts(allAttempts);
      } catch (error) {
        console.error('Failed to fetch attempts:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAttempts();
  }, []);

  const handleResetAttempt = async (attemptId: string) => {
    try {
      await updateDoc(doc(db, 'attempts', attemptId), { status: 'in_progress', violationReason: '' });
      setAttempts(attempts.map(a => a.id === attemptId ? { ...a, status: 'in_progress', violationReason: undefined } : a));
      toast.success('Attempt reset successfully.');
    } catch (error) {
      console.error('Error resetting attempt:', error);
      toast.error('Failed to reset attempt.');
    }
  };

  const toggleDetails = async (a: Attempt) => {
    if (expandedId === a.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(a.id);
    if (!questionDetails[a.id] && a.variantId) {
      setLoadingDetails(a.id);
      try {
        const qSnap = await getDocs(collection(db, `exams/${a.examId}/variants/${a.variantId}/questions`));
        const qs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
        setQuestionDetails(prev => ({ ...prev, [a.id]: qs }));
      } catch (error) {
        console.error('Failed to fetch question details:', error);
        toast.error('Failed to load question details.');
      } finally {
        setLoadingDetails(null);
      }
    }
  };

  const filteredAttempts = attempts.filter(a =>
    (a.studentName || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div>Loading attempts...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Attempts Overview</h2>
        <input
          type="text"
          placeholder="Search by student name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exam</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Time Taken</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filteredAttempts.map(a => (
              <Fragment key={a.id}>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{a.studentName || a.studentId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 truncate max-w-xs">{a.examTitle || a.examId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {typeof a.score === 'number' ? `${a.score}/${a.totalQuestions}` : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{formatDuration(a.startedAt, a.finishedAt)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                     <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        a.status === 'completed' ? 'bg-green-100 text-green-800' :
                        a.status === 'flagged' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {a.status}
                      </span>
                      {a.status === 'flagged' && <p className="text-xs text-red-500 mt-1">{a.violationReason}</p>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                    <button onClick={() => toggleDetails(a)} className="text-slate-600 hover:text-slate-900">
                      {expandedId === a.id ? 'Hide' : 'View'} Details
                    </button>
                    {a.status === 'flagged' && (
                        <button onClick={() => handleResetAttempt(a.id)} className="text-blue-600 hover:text-blue-900">Reset</button>
                    )}
                  </td>
                </tr>
                {expandedId === a.id && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 bg-slate-50">
                      {loadingDetails === a.id && <div className="text-sm text-slate-500">Loading questions...</div>}
                      {questionDetails[a.id] && (
                        <div className="space-y-3">
                          {questionDetails[a.id].map((q, idx) => {
                            const chosen = a.answers?.[q.id];
                            const isCorrect = chosen === q.correctOption;
                            return (
                              <div key={q.id} className="text-sm">
                                <p className="font-medium text-slate-800">{idx + 1}. {q.text}</p>
                                <p className={isCorrect ? 'text-green-700' : 'text-red-700'}>
                                  Answered: {chosen !== undefined ? q.options[chosen] : '(no answer)'} {isCorrect ? '✓' : `✗ (correct: ${q.options[q.correctOption]})`}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!loadingDetails && !questionDetails[a.id] && !a.variantId && (
                        <div className="text-sm text-slate-500">No question details available for this attempt.</div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filteredAttempts.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-4 text-center text-sm text-slate-500">No attempts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}