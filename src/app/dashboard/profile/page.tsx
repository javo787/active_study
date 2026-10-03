'use client';

import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import ProfileForm from '@/components/ProfileForm';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 sm:p-8 rounded-lg shadow-sm border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Your Profile</h2>

      <div className="mb-6 p-4 bg-slate-50 rounded-md border border-slate-100">
        <p className="text-sm text-slate-500 mb-1">Email Address</p>
        <p className="font-medium text-slate-800">{user.email || 'Signed in with Telegram'}</p>
        <p className="text-sm text-slate-500 mb-1 mt-3">Account Role</p>
        <p className="font-medium text-slate-800 capitalize">{user.role}</p>
      </div>

      <ProfileForm
        kind={user.role === 'student' && user.teacherStatus !== 'pending' ? 'student' : 'teacher'}
        submitLabel="Save Changes"
        onSubmit={async (data) => {
          await updateProfile(data);
          toast.success('Profile updated.');
        }}
      />
    </div>
  );
}
