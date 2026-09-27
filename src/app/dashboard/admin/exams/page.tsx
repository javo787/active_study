'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam } from '@/types';
import { toast, Toaster } from 'react-hot-toast';

export default function AdminExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const examsSnap = await getDocs(collection(db, 'exams'));
        const examsData = examsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Exam));
        setExams(examsData);
      } catch (error) {
        console.error('Failed to fetch exams:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchExams();
  }, []);

  const handleUnpublishExam = async (examId: string) => {
    try {
      await updateDoc(doc(db, 'exams', examId), { isPublished: false });
      setExams(exams.map(e => e.id === examId ? { ...e, isPublished: false } : e));
      toast.success('Exam unpublished successfully.');
    } catch (error) {
      console.error('Error unpublishing exam:', error);
      toast.error('Failed to unpublish exam.');
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (!confirm('Are you sure you want to permanently delete this exam?')) return;
    try {
      await deleteDoc(doc(db, 'exams', examId));
      setExams(exams.filter(e => e.id !== examId));
      toast.success('Exam deleted successfully.');
    } catch (error) {
      console.error('Error deleting exam:', error);
      toast.error('Failed to delete exam.');
    }
  };

  if (loading) {
    return <div>Loading exams...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Content Moderation (Exams)</h2>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {exams.map(e => (
              <tr key={e.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{e.title}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    e.isPublished ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {e.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  {e.isPublished && (
                    <button onClick={() => handleUnpublishExam(e.id)} className="text-orange-600 hover:text-orange-900">Force Unpublish</button>
                  )}
                  <button onClick={() => handleDeleteExam(e.id)} className="text-red-600 hover:text-red-900">Delete</button>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr><td colSpan={3} className="px-6 py-4 text-center text-sm text-slate-500">No exams found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
