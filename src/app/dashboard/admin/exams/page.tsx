'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam } from '@/types';
import { toast } from 'react-hot-toast';
import { deleteExamCascade } from '@/lib/examOps';
import { formatDistanceToNow } from 'date-fns';

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
    if (!confirm('Are you sure you want to permanently delete this exam and all its contents?')) return;
    const t = toast.loading('Deleting exam...');
    try {
      await deleteExamCascade(examId);
      setExams(exams.filter(e => e.id !== examId));
      toast.success('Exam deleted successfully.', { id: t });
    } catch (error) {
      console.error('Error deleting exam:', error);
      toast.error('Failed to delete exam.', { id: t });
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-500">Loading exams...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Content Moderation (Exams)</h2>

      {/* Mobile view: Stacked Cards */}
      <div className="md:hidden space-y-4">
        {exams.length === 0 ? (
          <div className="text-center text-sm text-slate-500 p-4">No exams found.</div>
        ) : (
          exams.map(e => (
            <div key={e.id} className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start gap-2">
                <div className="text-sm font-medium text-slate-900">{e.title}</div>
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full shrink-0 ${
                  e.isPublished ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {e.isPublished ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <div>Created by: {e.createdByName || 'Unknown'}</div>
                <div>Expires in: {e.expiresAt ? formatDistanceToNow('toDate' in e.expiresAt ? e.expiresAt.toDate() : (e.expiresAt as Date)) : 'Never'}</div>
              </div>
              <div className="flex gap-2 w-full pt-2 border-t border-slate-100">
                {e.isPublished && (
                  <button onClick={() => handleUnpublishExam(e.id)} className="flex-1 min-h-[44px] bg-orange-50 text-orange-600 rounded-md font-medium text-sm hover:bg-orange-100 transition-colors">Force Unpublish</button>
                )}
                <button onClick={() => handleDeleteExam(e.id)} className="flex-1 min-h-[44px] bg-red-50 text-red-600 rounded-md font-medium text-sm hover:bg-red-100 transition-colors">Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop view: Table */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Creator</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Expires In</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {exams.map(e => (
              <tr key={e.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{e.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{e.createdByName || 'Unknown'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {e.expiresAt ? formatDistanceToNow('toDate' in e.expiresAt ? e.expiresAt.toDate() : (e.expiresAt as Date)) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    e.isPublished ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {e.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                  {e.isPublished && (
                    <button onClick={() => handleUnpublishExam(e.id)} className="text-orange-600 hover:text-orange-900 font-medium p-1">Force Unpublish</button>
                  )}
                  <button onClick={() => handleDeleteExam(e.id)} className="text-red-600 hover:text-red-900 font-medium p-1">Delete</button>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-4 text-center text-sm text-slate-500">No exams found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
