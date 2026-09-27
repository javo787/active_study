'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User, Exam, Attempt, UserRole } from '@/types';
import { toast, Toaster } from 'react-hot-toast';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTeachers: 0,
    totalExams: 0,
    totalAttempts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

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

        setUsers(usersData);
        setExams(examsData);
        setAttempts(allAttempts);

        setStats({
          totalUsers: usersData.length,
          totalTeachers: usersData.filter(u => u.role === 'teacher').length,
          totalExams: examsData.length,
          totalAttempts: nonPreviewAttempts.length,
        });
      } catch (error) {
        console.error('Failed to fetch admin stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
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
      setStats(prev => ({ ...prev, totalExams: prev.totalExams - 1 }));
      toast.success('Exam deleted successfully.');
    } catch (error) {
      console.error('Error deleting exam:', error);
      toast.error('Failed to delete exam.');
    }
  };

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

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(users.map(u => u.uid === userId ? { ...u, role: newRole } : u));
      setStats(prev => ({
        ...prev,
        totalTeachers: users.map(u => u.uid === userId ? { ...u, role: newRole } : u).filter(u => u.role === 'teacher').length
      }));
      toast.success('User role updated successfully.');
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update user role.');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Admin Overview</h2>

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

      <div className="mb-10">
        <h3 className="text-xl font-bold text-slate-800 mb-4">User Management</h3>
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name / Email</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Current Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {users.map(u => (
                <tr key={u.uid}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">{u.displayName}</div>
                    <div className="text-sm text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                      u.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      disabled={u.role === 'admin'} // Prevent admin from demoting themselves easily by accident (optional safety)
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-10">
        <h3 className="text-xl font-bold text-slate-800 mb-4">Content Moderation (Exams)</h3>
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
      </div>

      <div className="mb-10">
        <h3 className="text-xl font-bold text-slate-800 mb-4">Proctoring Override (Flagged Attempts)</h3>
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exam ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Reason</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {attempts.filter(a => a.status === 'flagged').map(a => (
                <tr key={a.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 truncate max-w-xs">{a.studentId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 truncate max-w-xs">{a.examId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">{a.violationReason || 'Unknown'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleResetAttempt(a.id)} className="text-blue-600 hover:text-blue-900">Reset Attempt</button>
                  </td>
                </tr>
              ))}
              {attempts.filter(a => a.status === 'flagged').length === 0 && (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-sm text-slate-500">No flagged attempts.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}
