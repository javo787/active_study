'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, Timestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User, UserRole } from '@/types';
import { toast } from 'react-hot-toast';
import { UserGroups } from '@/components/groups/UserGroups';
import { HeadTeacherToggle } from '@/components/admin/HeadTeacherToggle';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill, PillTone } from '@/components/ui/Pill';

// Telegram sign-ins have no e-mail and often no display name, so lean on what the person typed in onboarding.
const personName = (u: User) => u.fullName || u.displayName || 'Unnamed';
const ROLE_TONE: Record<string, PillTone> = { admin: 'info', teacher: 'good', student: 'neutral' };

const personDetails = (u: User) =>
  [u.university, u.role === 'student' && u.course ? `Year ${u.course}` : u.department].filter(Boolean).join(' · ') ||
  u.email ||
  'Telegram sign-in';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const usersData = usersSnap.docs.map(d => ({ ...d.data(), uid: d.id } as User));
        setUsers(usersData);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      // Any manual role change settles a teacher request, one way or the other.
      const updates: Record<string, unknown> = { role: newRole, teacherStatus: deleteField() };
      // The head teacher flag belongs to a teacher: moving the person to any other role takes it back.
      if (newRole !== 'teacher') updates.headTeacher = deleteField();
      if (newRole === 'student') {
        updates.expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      } else {
        updates.expiresAt = deleteField();
      }
      await updateDoc(doc(db, 'users', userId), updates);
      setUsers(users.map(u => u.uid === userId
        ? { ...u, role: newRole, teacherStatus: undefined, headTeacher: newRole === 'teacher' ? u.headTeacher : undefined }
        : u));
      toast.success('User role updated successfully.');
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update user role.');
    }
  };

  const setHeadTeacher = async (userId: string, on: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { headTeacher: on ? true : deleteField() });
      setUsers(users.map(u => u.uid === userId ? { ...u, headTeacher: on ? true : undefined } : u));
      toast.success(on ? 'Head teacher set. They can answer teacher requests.' : 'Head teacher removed.');
    } catch (error) {
      console.error('Error changing head teacher:', error);
      toast.error('Could not change the head teacher.');
    }
  };

  const rejectRequest = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { teacherStatus: 'rejected' });
      setUsers(users.map(u => u.uid === userId ? { ...u, teacherStatus: 'rejected' } : u));
      toast.success('Request declined. You can still approve it later.');
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast.error('Could not decline the request.');
    }
  };

  const requests = users.filter(u => u.teacherStatus === 'pending');

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Change roles, make a teacher the head teacher, answer teacher requests and see which groups a person teaches or belongs to." />

      {requests.length > 0 && (
        <section aria-labelledby="requests-title" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 id="requests-title" className="font-semibold text-amber-900 mb-3">
            Teacher requests ({requests.length})
          </h3>
          <ul className="space-y-3">
            {requests.map(u => (
              <li key={u.uid} className="bg-white rounded-md border border-amber-100 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{personName(u)}</div>
                  <div className="text-sm text-slate-500">{[u.department, u.university].filter(Boolean).join(' · ') || 'No details given'}</div>
                  <div className="text-xs text-slate-400">{u.email || 'Telegram sign-in'}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button" onClick={() => handleRoleChange(u.uid, 'teacher')}
                    className="px-4 min-h-[44px] rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button" onClick={() => rejectRequest(u.uid)}
                    className="px-4 min-h-[44px] rounded-md border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mobile view: Stacked Cards */}
      <div className="md:hidden space-y-4">
        {users.map(u => (
          <div key={u.uid} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-sm font-medium text-ink">{personName(u)}</div>
                <div className="text-sm text-slate-500">{personDetails(u)}</div>
                <UserGroups user={u} />
              </div>
              <div className="flex flex-col items-end gap-1">
                <Pill tone={ROLE_TONE[u.role] ?? 'neutral'}>{u.role}</Pill>
                {u.role === 'teacher' && u.headTeacher && <Pill tone="info">Head teacher</Pill>}
              </div>
            </div>
            <select
              value={u.role}
              onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
              className="mt-2 block w-full min-h-[44px] pl-3 pr-10 py-2 text-base border border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              disabled={u.role === 'admin'}
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
            {u.role === 'teacher' && (
              <HeadTeacherToggle on={u.headTeacher === true} onChange={on => setHeadTeacher(u.uid, on)} />
            )}
          </div>
        ))}
      </div>

      {/* Desktop view: Table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/70">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500">Person</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500">Role</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500">Change role</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.uid}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-ink">{personName(u)}</div>
                  <div className="text-sm text-slate-500">{personDetails(u)}</div>
                  <UserGroups user={u} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap align-top">
                  <div className="flex flex-col items-start gap-1">
                    <Pill tone={ROLE_TONE[u.role] ?? 'neutral'}>{u.role}</Pill>
                    {u.role === 'teacher' && u.headTeacher && <Pill tone="info">Head teacher</Pill>}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    disabled={u.role === 'admin'}
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                  {u.role === 'teacher' && (
                    <HeadTeacherToggle on={u.headTeacher === true} onChange={on => setHeadTeacher(u.uid, on)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
