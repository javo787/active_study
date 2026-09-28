'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Exam, Attempt } from '@/types';
import { toMillis, toDate } from '@/lib/time';
import { formatDistanceToNow } from 'date-fns';
import { FileText, Database, Users, AlertCircle, PlusCircle, Upload, List } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    publishedExams: 0,
    activeNow: 0,
    completed: 0,
    flagged: 0,
  });
  const [recentAttempts, setRecentAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;
      try {
        const now = Date.now();

        // 1. Fetch Exams
        const examsRef = collection(db, 'exams');
        let examsQ = query(examsRef);
        if (user.role !== 'admin') {
          examsQ = query(examsRef, where('createdBy', '==', user.uid));
        }
        const examsSnap = await getDocs(examsQ);

        const validExams = examsSnap.docs
          .map(d => ({ ...d.data(), id: d.id } as Exam))
          .filter(e => {
            const expMs = toMillis(e.expiresAt);
            return !expMs || expMs > now;
          });

        const publishedCount = validExams.filter(e => e.isPublished).length;

        // 2. Fetch Attempts
        const attemptsRef = collection(db, 'attempts');
        let attemptsQ = query(attemptsRef);
        if (user.role !== 'admin') {
          attemptsQ = query(attemptsRef, where('teacherId', '==', user.uid));
        }
        const attemptsSnap = await getDocs(attemptsQ);

        const validAttempts = attemptsSnap.docs
          .map(d => ({ ...d.data(), id: d.id } as Attempt))
          .filter(a => !a.isPreview)
          .filter(a => {
            const expMs = toMillis(a.expiresAt);
            return !expMs || expMs > now;
          });

        const activeNow = validAttempts.filter(a => a.status === 'in_progress').length;
        const completed = validAttempts.filter(a => a.status === 'completed').length;
        const flagged = validAttempts.filter(a => a.status === 'flagged').length;

        setStats({
          publishedExams: publishedCount,
          activeNow,
          completed,
          flagged
        });

        // 3. Sort for recent
        const sorted = validAttempts.sort((a, b) => {
           const timeA = toMillis(a.finishedAt) || toMillis(a.startedAt) || 0;
           const timeB = toMillis(b.finishedAt) || toMillis(b.startedAt) || 0;
           return timeB - timeA;
        });

        setRecentAttempts(sorted.slice(0, 5));

      } catch (error) {
        console.error('Failed to load teacher dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-200 rounded-lg"></div>)}
        </div>
        <div className="h-64 bg-slate-200 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-slate-800">Teacher Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><FileText className="w-5 h-5" /></div>
            <h3 className="text-sm font-semibold text-slate-600">My Exams</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.publishedExams}</p>
          <p className="text-xs text-slate-500 mt-1">published</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Users className="w-5 h-5" /></div>
            <h3 className="text-sm font-semibold text-slate-600">Active Now</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.activeNow}</p>
          <p className="text-xs text-slate-500 mt-1">in progress</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 text-green-600 rounded-lg"><Database className="w-5 h-5" /></div>
            <h3 className="text-sm font-semibold text-slate-600">Completed</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.completed}</p>
          <p className="text-xs text-slate-500 mt-1">attempts saved</p>
        </div>

        <Link href="/dashboard/teacher/attempts?status=flagged" className="block bg-white p-5 rounded-xl shadow-sm border border-red-200 hover:border-red-300 hover:shadow-md transition-all group">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg group-hover:bg-red-200 transition-colors"><AlertCircle className="w-5 h-5" /></div>
            <h3 className="text-sm font-semibold text-red-700">Flagged</h3>
          </div>
          <p className="text-3xl font-bold text-red-700">{stats.flagged}</p>
          <p className="text-xs text-red-500 mt-1">require attention &rarr;</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
             <h3 className="text-lg font-bold text-slate-800">Recent Attempts</h3>
             <Link href="/dashboard/teacher/attempts" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {recentAttempts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                 No attempts recorded yet.
              </div>
            ) : (
              recentAttempts.map(a => {
                const date = toDate(a.finishedAt || a.startedAt);
                return (
                  <div key={a.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                     <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{a.studentName || a.studentEmail}</p>
                          <StatusBadge status={a.status} />
                        </div>
                        <p className="text-xs text-slate-500 truncate">{a.examTitle}</p>
                     </div>
                     <div className="text-right ml-4">
                        {a.score !== undefined && a.totalQuestions ? (
                           <div className="text-sm font-bold text-slate-700">{a.score}/{a.totalQuestions}</div>
                        ) : (
                           <div className="text-sm font-medium text-slate-500">—</div>
                        )}
                        <div className="text-xs text-slate-400 mt-0.5">{date ? formatDistanceToNow(date, {addSuffix: true}) : ''}</div>
                     </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-800">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
             <Link href="/dashboard/teacher/exams/create" className="flex items-center gap-3 p-4 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-md group-hover:bg-blue-100"><PlusCircle className="w-5 h-5" /></div>
                <div className="font-medium text-slate-700 group-hover:text-blue-700">New Exam</div>
             </Link>
             <Link href="/dashboard/teacher/importer" className="flex items-center gap-3 p-4 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-md group-hover:bg-blue-100"><Upload className="w-5 h-5" /></div>
                <div className="font-medium text-slate-700 group-hover:text-blue-700">Import Test</div>
             </Link>
             <Link href="/dashboard/teacher/exams" className="flex items-center gap-3 p-4 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                <div className="p-2 bg-slate-50 text-slate-600 rounded-md group-hover:bg-slate-100"><List className="w-5 h-5" /></div>
                <div className="font-medium text-slate-700 group-hover:text-slate-900">My Exams</div>
             </Link>
             <Link href="/dashboard/teacher/attempts" className="flex items-center gap-3 p-4 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                <div className="p-2 bg-slate-50 text-slate-600 rounded-md group-hover:bg-slate-100"><Database className="w-5 h-5" /></div>
                <div className="font-medium text-slate-700 group-hover:text-slate-900">All Attempts</div>
             </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
