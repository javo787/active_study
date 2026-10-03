'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User, Exam, Attempt } from '@/types';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTeachers: 0,
    totalExams: 0,
    totalAttempts: 0,
    pendingRequests: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [usersSnap, examsSnap, attemptsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'exams')),
          getDocs(collection(db, 'attempts')),
        ]);

        const usersData = usersSnap.docs.map(d => ({ ...d.data(), uid: d.id } as User));
        const examsData = examsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Exam));
        // Exclude preview attempts from stats, but include them for the table if we want, or keep out. Let's keep them in the state but exclude from stats.
        const allAttempts = attemptsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Attempt));
        const nonPreviewAttempts = allAttempts.filter(a => !a.isPreview);

        setStats({
          totalUsers: usersData.length,
          totalTeachers: usersData.filter(u => u.role === 'teacher').length,
          totalExams: examsData.length,
          totalAttempts: nonPreviewAttempts.length,
          pendingRequests: usersData.filter(u => u.teacherStatus === 'pending').length,
        });
      } catch (error) {
        console.error('Failed to fetch admin stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Admin Overview</h2>

      {!loading && stats.pendingRequests > 0 && (
        <Link
          href="/dashboard/admin/users"
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 min-h-[44px] text-sm text-amber-900 hover:bg-amber-100"
        >
          <span><strong>{stats.pendingRequests}</strong> teacher {stats.pendingRequests === 1 ? 'request is' : 'requests are'} waiting for review</span>
          <span className="font-medium underline">Review</span>
        </Link>
      )}

      {loading ? (
        <p>Loading stats...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Users</h3>
            <p className="text-3xl font-bold text-slate-800">{stats.totalUsers}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Teachers</h3>
            <p className="text-3xl font-bold text-blue-600">{stats.totalTeachers}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Exams</h3>
            <p className="text-3xl font-bold text-emerald-600">{stats.totalExams}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Attempts</h3>
            <p className="text-3xl font-bold text-purple-600">{stats.totalAttempts}</p>
          </div>
        </div>
      )}
    </div>
  );
}
