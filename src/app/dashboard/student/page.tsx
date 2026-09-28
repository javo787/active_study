'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam } from '@/types';

export default function StudentDashboard() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const q = query(collection(db, 'exams'), where('isPublished', '==', true));
        const snapshot = await getDocs(q);
        const examsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
        setExams(examsData);
      } catch (error) {
        console.error('Failed to fetch exams:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchExams();
  }, []);

  if (loading) return <div className="text-center mt-10">Loading exams...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Available Exams</h2>

      {exams.length === 0 ? (
        <p className="text-slate-500">No exams available at the moment.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map(exam => (
            <div key={exam.id} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-700 mb-2">{exam.title}</h3>
              <p className="text-slate-500 mb-4 text-sm">{exam.description || 'No description'}</p>
              <div className="flex justify-between items-center mb-4 text-sm text-slate-600">
                <span>Time Limit: {exam.timeLimit} mins</span>
              </div>
              <Link
                href={`/exam?id=${exam.id}`}
                className="inline-flex items-center justify-center bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors w-full text-center min-h-[44px]"
              >
                Start Exam
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
