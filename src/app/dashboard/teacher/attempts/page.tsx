'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Attempt } from '@/types';
import { toast, Toaster } from 'react-hot-toast';

export default function AttemptsDashboard() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        const attemptsSnap = await getDocs(collection(db, 'attempts'));
        const allAttempts = attemptsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Attempt));
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

  if (loading) return <div>Loading attempts...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Attempts Overview</h2>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exam ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {attempts.map(a => (
              <tr key={a.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 truncate max-w-xs">{a.studentId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 truncate max-w-xs">{a.examId}</td>
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
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {a.status === 'flagged' && (
                      <button onClick={() => handleResetAttempt(a.id)} className="text-blue-600 hover:text-blue-900">Reset Attempt</button>
                  )}
                </td>
              </tr>
            ))}
            {attempts.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-4 text-center text-sm text-slate-500">No attempts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}
