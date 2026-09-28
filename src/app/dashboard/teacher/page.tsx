'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Attempt, Exam } from '@/types';
import Link from 'next/link';
import { FileText, Activity, CheckCircle, AlertTriangle, Plus, Upload, List, Users } from 'lucide-react';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    myExams: 0,
    activeNow: 0,
    completed: 0,
    flagged: 0
  });
  const [recentAttempts, setRecentAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;
      try {
        // Fetch Exams
        const examsQ = user.role === 'admin'
          ? collection(db, 'exams')
          : query(collection(db, 'exams'), where('createdBy', '==', user.uid));

        const examsSnap = await getDocs(examsQ);
        const exams = examsSnap.docs.map(d => d.data() as Exam);
        const publishedCount = exams.filter(e => e.isPublished).length;

        // Fetch Attempts Stats
        const attemptsQ = user.role === 'admin'
          ? collection(db, 'attempts')
          : query(collection(db, 'attempts'), where('teacherId', '==', user.uid));

        const attemptsSnap = await getDocs(attemptsQ);
        const attempts = attemptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attempt));

        let activeNow = 0;
        let completed = 0;
        let flagged = 0;

        attempts.forEach(a => {
           if (a.status === 'in_progress') activeNow++;
           else if (a.status === 'completed') completed++;
           else if (a.status === 'flagged') flagged++;
        });

        setStats({
          myExams: publishedCount,
          activeNow,
          completed,
          flagged
        });

        // Recent attempts
        const sorted = attempts.sort((a, b) => {
           const aStart = a.startedAt && 'toMillis' in a.startedAt ? a.startedAt.toMillis() : (a.startedAt instanceof Date ? a.startedAt.getTime() : 0);
           const bStart = b.startedAt && 'toMillis' in b.startedAt ? b.startedAt.toMillis() : (b.startedAt instanceof Date ? b.startedAt.getTime() : 0);
           return bStart - aStart;
        }).slice(0, 5);

        setRecentAttempts(sorted);
      } catch (error) {
        console.error('Error fetching teacher dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  if (loading) {
    return <div className="text-slate-500 animate-pulse">Loading dashboard...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Teacher Dashboard</h2>
        <p className="text-slate-500 text-sm">Welcome back. Here is an overview of your exams and student attempts.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/teacher/exams" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
          <div className="flex items-center gap-3 mb-3">
             <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
               <FileText className="w-5 h-5" />
             </div>
             <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">My Exams</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.myExams}</p>
        </Link>
        <Link href="/dashboard/teacher/attempts?status=in_progress" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-yellow-300 hover:shadow-md transition-all group">
          <div className="flex items-center gap-3 mb-3">
             <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600 group-hover:bg-yellow-500 group-hover:text-white transition-colors">
               <Activity className="w-5 h-5" />
             </div>
             <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Active Now</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.activeNow}</p>
        </Link>
        <Link href="/dashboard/teacher/attempts?status=completed" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-green-300 hover:shadow-md transition-all group">
          <div className="flex items-center gap-3 mb-3">
             <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
               <CheckCircle className="w-5 h-5" />
             </div>
             <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Completed</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.completed}</p>
        </Link>
        <Link href="/dashboard/teacher/attempts?status=flagged" className="bg-white p-5 rounded-xl border border-red-200 shadow-sm hover:border-red-400 hover:shadow-md transition-all group">
          <div className="flex items-center gap-3 mb-3">
             <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors">
               <AlertTriangle className="w-5 h-5" />
             </div>
             <p className="text-sm font-medium text-red-500 uppercase tracking-wide">Flagged</p>
          </div>
          <p className="text-3xl font-bold text-red-600">{stats.flagged}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Recent Attempts */}
         <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-end border-b border-slate-200 pb-2">
               <h3 className="text-lg font-semibold text-slate-800">Recent Attempts</h3>
               <Link href="/dashboard/teacher/attempts" className="text-sm text-blue-600 hover:underline font-medium">View all</Link>
            </div>
            {recentAttempts.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                 {recentAttempts.map(a => (
                   <div key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                      <div>
                        <p className="font-medium text-slate-900">{a.studentName || 'Unknown Student'}</p>
                        <p className="text-sm text-slate-500 truncate max-w-sm">{a.examTitle || 'Unknown Exam'}</p>
                      </div>
                      <div className="flex items-center gap-4">
                         <div className="text-right">
                            {a.score !== undefined && a.totalQuestions !== undefined ? (
                               <p className="font-medium text-slate-900">{a.score}/{a.totalQuestions}</p>
                            ) : (
                               <p className="text-sm text-slate-500">—</p>
                            )}
                            <p className="text-xs text-slate-400 capitalize">{a.status.replace('_', ' ')}</p>
                         </div>
                         <Link href={`/dashboard/teacher/attempts?exam=${a.examId}`} className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors">
                           Details
                         </Link>
                      </div>
                   </div>
                 ))}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center">
                 <p className="text-slate-500">No recent attempts found.</p>
              </div>
            )}
         </div>

         {/* Quick Actions */}
         <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
               <h3 className="text-lg font-semibold text-slate-800">Quick Actions</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
               <Link href="/dashboard/teacher/exams/create" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                 <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                   <Plus className="w-5 h-5" />
                 </div>
                 <div>
                   <p className="font-medium text-slate-900">New Exam</p>
                   <p className="text-xs text-slate-500">Create manually</p>
                 </div>
               </Link>
               <Link href="/dashboard/teacher/importer" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                 <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                   <Upload className="w-5 h-5" />
                 </div>
                 <div>
                   <p className="font-medium text-slate-900">Import Test</p>
                   <p className="text-xs text-slate-500">From legacy files</p>
                 </div>
               </Link>
               <Link href="/dashboard/teacher/exams" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                 <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-slate-600 group-hover:text-white transition-colors shrink-0">
                   <List className="w-5 h-5" />
                 </div>
                 <div>
                   <p className="font-medium text-slate-900">My Exams</p>
                   <p className="text-xs text-slate-500">Manage your tests</p>
                 </div>
               </Link>
               <Link href="/dashboard/teacher/attempts" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                 <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-slate-600 group-hover:text-white transition-colors shrink-0">
                   <Users className="w-5 h-5" />
                 </div>
                 <div>
                   <p className="font-medium text-slate-900">All Attempts</p>
                   <p className="text-xs text-slate-500">View and proctor</p>
                 </div>
               </Link>
            </div>
         </div>
      </div>
    </div>
  );
}
