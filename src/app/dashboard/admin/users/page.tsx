'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, Timestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User, UserRole } from '@/types';
import { toast } from 'react-hot-toast';

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
      const updates: Record<string, unknown> = { role: newRole };
      if (newRole === 'student') {
        updates.expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      } else {
        updates.expiresAt = deleteField();
      }
      await updateDoc(doc(db, 'users', userId), updates);
      setUsers(users.map(u => u.uid === userId ? { ...u, role: newRole } : u));
      toast.success('User role updated successfully.');
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update user role.');
    }
  };

  if (loading) {
    return <div>Loading users...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">User Management</h2>

      {/* Mobile view: Stacked Cards */}
      <div className="md:hidden space-y-4">
        {users.map(u => (
          <div key={u.uid} className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-sm font-medium text-slate-900">{u.displayName}</div>
                <div className="text-sm text-slate-500">{u.email}</div>
              </div>
              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                u.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                'bg-slate-100 text-slate-800'
              }`}>
                {u.role}
              </span>
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
          </div>
        ))}
      </div>

      {/* Desktop view: Table */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
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
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    disabled={u.role === 'admin'}
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
  );
}
