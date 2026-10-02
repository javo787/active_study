'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { deleteExamCascade, duplicateExam, validateExamForPublish } from '@/lib/examOps';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Copy, Edit, Link as LinkIcon, MoreVertical, Trash2, Eye, EyeOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { appUrl } from '@/lib/appUrl';

export default function MyExamsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchExams = async () => {
      if (!user) return;
      try {
        const examsRef = collection(db, 'exams');
        let q = query(examsRef);

        if (user.role !== 'admin') {
          q = query(examsRef, where('createdBy', '==', user.uid));
        }

        const snap = await getDocs(q);
        const now = new Date();

        const examsData = snap.docs
          .map(d => ({ ...d.data(), id: d.id } as Exam))
          .filter(e => {
            const exp = e.expiresAt && 'toDate' in e.expiresAt ? e.expiresAt.toDate() : (e.expiresAt as Date);
            return exp > now; // hide expired
          })
          .sort((a, b) => {
             const tA = a.createdAt && 'toMillis' in a.createdAt ? a.createdAt.toMillis() : Infinity;
             const tB = b.createdAt && 'toMillis' in b.createdAt ? b.createdAt.toMillis() : Infinity;
             return tB - tA;
          });

        setExams(examsData);
      } catch (error) {
        console.error(error);
        toast.error('Failed to fetch exams');
      } finally {
        setLoading(false);
      }
    };
    fetchExams();
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenuId]);

  const handleDuplicate = async (examId: string) => {
    if (!user) return;
    const t = toast.loading('Duplicating exam...');
    try {
      const newId = await duplicateExam(examId, user);
      toast.success('Exam duplicated', { id: t });
      router.push(`/dashboard/teacher/exam?id=${newId}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to duplicate exam', { id: t });
    }
  };

  const handleDelete = async (examId: string) => {
    const inProgressSnap = await getDocs(query(
      collection(db, 'attempts'),
      where('examId', '==', examId),
      where('status', '==', 'in_progress')
    ));
    const warning = inProgressSnap.size > 0
      ? `${inProgressSnap.size} student(s) are currently taking this exam. Deleting it will cut them off. `
      : '';
    if (!confirm(`${warning}Are you sure you want to delete this exam? This action cannot be undone.`)) return;
    const t = toast.loading('Deleting exam...');
    try {
      await deleteExamCascade(examId);
      setExams(exams.filter(e => e.id !== examId));
      toast.success('Exam deleted', { id: t });
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete exam', { id: t });
    }
  };

  const handleTogglePublish = async (exam: Exam) => {
    if (!exam.isPublished) {
      const errorMsg = await validateExamForPublish(exam.id);
      if (errorMsg) {
        toast.error(`Cannot publish: ${errorMsg}`);
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'exams', exam.id), { isPublished: !exam.isPublished });
      setExams(exams.map(e => e.id === exam.id ? { ...e, isPublished: !e.isPublished } : e));
      toast.success(exam.isPublished ? 'Exam unpublished' : 'Exam published');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update status');
    }
  };

  const handleShare = async (examId: string) => {
    const url = appUrl(`/exam?id=${examId}`);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Take Exam',
          text: 'Please sign in to take this exam',
          url
        });
      } catch (e) {
        console.error(e);
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  };

  const filteredExams = exams.filter(e => e.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">My Exams</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <Link href="/dashboard/teacher/exams/create" className="flex-1 sm:flex-none text-center bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700 min-h-[44px] flex items-center justify-center">
            + New Exam
          </Link>
          <Link href="/dashboard/teacher/importer" className="flex-1 sm:flex-none text-center bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md font-medium hover:bg-slate-50 min-h-[44px] flex items-center justify-center">
            Import
          </Link>
        </div>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search exams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-4 pr-10 py-3 rounded-lg border border-slate-200 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading...</div>
      ) : filteredExams.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-slate-200 shadow-sm">
          <h3 className="text-lg font-medium text-slate-900 mb-2">No exams found</h3>
          <p className="text-slate-500 mb-6">Create a new exam or import one to get started.</p>
          <div className="flex justify-center gap-4">
            <Link href="/dashboard/teacher/exams/create" className="text-blue-600 hover:underline">Create Exam</Link>
            <span className="text-slate-300">|</span>
            <Link href="/dashboard/teacher/importer" className="text-blue-600 hover:underline">Import File</Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredExams.map(exam => (
            <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4">
              <div className="flex justify-between items-start gap-4">
                <h3 className="font-semibold text-slate-900 line-clamp-2">{exam.title}</h3>
                <div className="relative shrink-0" ref={openMenuId === exam.id ? menuRef : null}>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === exam.id ? null : exam.id)}
                    className="p-2 -m-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {openMenuId === exam.id && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-100 z-10 py-1">
                      <button onClick={() => { setOpenMenuId(null); router.push(`/dashboard/teacher/exam?id=${exam.id}`); }} className="w-full text-left px-4 py-2 min-h-[44px] text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <Edit className="w-4 h-4" /> Edit Content
                      </button>
                      <button onClick={() => { setOpenMenuId(null); handleShare(exam.id); }} className="w-full text-left px-4 py-2 min-h-[44px] text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <LinkIcon className="w-4 h-4" /> Share Link
                      </button>
                      <button onClick={() => { setOpenMenuId(null); handleTogglePublish(exam); }} className="w-full text-left px-4 py-2 min-h-[44px] text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        {exam.isPublished ? <><EyeOff className="w-4 h-4" /> Unpublish</> : <><Eye className="w-4 h-4" /> Publish</>}
                      </button>
                      <button onClick={() => { setOpenMenuId(null); handleDuplicate(exam.id); }} className="w-full text-left px-4 py-2 min-h-[44px] text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <Copy className="w-4 h-4" /> Duplicate
                      </button>
                      <div className="h-px bg-slate-100 my-1"></div>
                      <button onClick={() => { setOpenMenuId(null); handleDelete(exam.id); }} className="w-full text-left px-4 py-2 min-h-[44px] text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => router.push(`/dashboard/teacher/exam?id=${exam.id}`)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 rounded-md min-h-[44px] flex items-center justify-center gap-2">
                   <Edit className="w-4 h-4" /> Manage
                </button>
                <button onClick={() => handleShare(exam.id)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 rounded-md min-h-[44px] flex items-center justify-center gap-2">
                   <LinkIcon className="w-4 h-4" /> Share
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-auto pt-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  !exam.isPublished ? 'bg-slate-100 text-slate-600' :
                  exam.visibility === 'link' ? 'bg-purple-100 text-purple-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {!exam.isPublished ? 'Draft' : exam.visibility === 'link' ? 'Link-only' : 'Published'}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {exam.timeLimit}m
                </span>
              </div>

              <div className="text-sm text-slate-500 mt-auto pt-4 border-t border-slate-50 flex justify-between items-center">
                <span>Expires in {formatDistanceToNow(exam.expiresAt && 'toDate' in exam.expiresAt ? exam.expiresAt.toDate() : (exam.expiresAt as Date))}</span>
                <Link href={`/dashboard/teacher/exam?id=${exam.id}`} className="text-blue-600 font-medium hover:underline p-1 -m-1">Manage</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
