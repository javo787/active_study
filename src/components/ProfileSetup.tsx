'use client';

import { useState } from 'react';
import { GraduationCap, BookOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { peekPendingJoinCode } from '@/lib/groups';
import ProfileForm, { ProfileKind } from '@/components/ProfileForm';

const CHOICES: { kind: ProfileKind; title: string; text: string; Icon: typeof GraduationCap }[] = [
  { kind: 'student', title: 'I am a student', text: 'Take exams and see your results.', Icon: GraduationCap },
  { kind: 'teacher', title: 'I am a teacher', text: 'Create exams and groups. An admin confirms your access.', Icon: BookOpen },
];

export default function ProfileSetup() {
  const { updateProfile } = useAuth();
  // Someone who opened a class invite link is a student: do not ask them a question they already answered.
  const [kind, setKind] = useState<ProfileKind | null>(() => (peekPendingJoinCode() ? 'student' : null));

  const save = async (data: Parameters<typeof updateProfile>[0]) => {
    await updateProfile(data);
    toast.success(data.requestTeacher ? 'Request sent. You can use the student view while you wait.' : 'Welcome aboard!');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
        {kind === null ? (
          <>
            <h2 className="text-2xl font-bold text-slate-800 mb-1 text-center">Welcome to Duxtur Edu</h2>
            <p className="text-slate-500 text-sm mb-6 text-center">Who are you?</p>
            <div className="space-y-3">
              {CHOICES.map(({ kind: k, title, text, Icon }) => (
                <button
                  key={k} type="button" onClick={() => setKind(k)}
                  className="w-full flex items-center gap-4 text-left p-4 min-h-[44px] rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <span className="shrink-0 w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-800">{title}</span>
                    <span className="block text-sm text-slate-500">{text}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-slate-800 mb-1 text-center">
              {kind === 'student' ? 'Tell us about you' : 'Request teacher access'}
            </h2>
            <p className="text-slate-500 text-sm mb-6 text-center">
              {kind === 'student' ? 'It takes about 30 seconds.' : 'An admin reviews every request. You can use the student view in the meantime.'}
            </p>
            <ProfileForm
              kind={kind}
              askGroupCode
              requestAccess
              submitLabel={kind === 'student' ? 'Start learning' : 'Send request'}
              onSubmit={save}
            />
            {!peekPendingJoinCode() && (
              <button
                type="button" onClick={() => setKind(null)}
                className="w-full mt-3 text-sm text-slate-500 hover:text-slate-800 underline min-h-[44px]"
              >
                Back
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
