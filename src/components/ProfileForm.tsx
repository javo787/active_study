'use client';

import { useState } from 'react';
import { ProfileData, useAuth } from '@/contexts/AuthContext';
import { JoinGroupError, isValidJoinCode, normalizeJoinCode, peekPendingJoinCode } from '@/lib/groups';
import { COURSES, UNIVERSITIES } from '@/lib/university';

export type ProfileKind = 'student' | 'teacher';

const OTHER = '__other__';

const inputClass =
  'w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] bg-white aria-[invalid=true]:border-red-500';

interface Props {
  kind: ProfileKind;
  submitLabel: string;
  /** Onboarding only: lets a new student enter a group code right away. */
  askGroupCode?: boolean;
  /** Onboarding only: a teacher's submit also asks the admin for teacher access. */
  requestAccess?: boolean;
  /** Persist the data. Throw to keep the form open. */
  onSubmit: (data: ProfileData) => Promise<void>;
}

function Field({ id, label, hint, error, children }: {
  id: string; label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-slate-500 mt-1">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export default function ProfileForm({ kind, submitLabel, askGroupCode = false, requestAccess = false, onSubmit }: Props) {
  const { user, joinGroup } = useAuth();

  const savedUniversity = user?.university ?? '';
  const knownUniversity = (UNIVERSITIES as readonly string[]).includes(savedUniversity);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [universityChoice, setUniversityChoice] = useState(
    knownUniversity ? savedUniversity : savedUniversity ? OTHER : ''
  );
  const [universityOther, setUniversityOther] = useState(knownUniversity ? '' : savedUniversity);
  const [course, setCourse] = useState(user?.course ? String(user.course) : '');
  const [group, setGroup] = useState(user?.group ?? '');
  const [department, setDepartment] = useState(user?.department ?? '');
  const [groupCode, setGroupCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // The student came from an invite link: the dashboard joins the group once the profile is saved.
  const [invited] = useState(() => !!peekPendingJoinCode());

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    const name = fullName.trim();
    if (name.length < 5 || !name.includes(' ')) e.fullName = 'Enter your first and last name.';
    if (!universityChoice) e.university = 'Choose your university.';
    else if (universityChoice === OTHER && universityOther.trim().length < 3) e.university = 'Type the name of your university.';
    if (kind === 'student' && !course) e.course = 'Choose your year of study.';
    if (kind === 'teacher' && department.trim().length < 2) e.department = 'Enter your department.';
    if (kind === 'student' && askGroupCode && groupCode.trim() && !isValidJoinCode(normalizeJoinCode(groupCode))) {
      e.groupCode = 'This code does not look right. It has 8 letters and digits.';
    }
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }

    setLoading(true);
    try {
      if (kind === 'student' && askGroupCode && groupCode.trim()) {
        try {
          await joinGroup(groupCode);
        } catch (err) {
          const message = err instanceof JoinGroupError && err.code === 'not_found'
            ? 'No group with this code. Check it with your teacher.'
            : 'Could not join the group. Try again.';
          setErrors({ groupCode: message });
          document.getElementById('groupCode')?.focus();
          return;
        }
      }

      const university = universityChoice === OTHER ? universityOther.trim() : universityChoice;
      await onSubmit(
        kind === 'student'
          ? { fullName: fullName.trim(), university, course: Number(course), group: group.trim() }
          : { fullName: fullName.trim(), university, department: department.trim(), requestTeacher: requestAccess }
      );
    } catch {
      setErrors({ form: 'Could not save. Check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  const describedBy = (id: string, hasHint = false) =>
    errors[id] ? `${id}-error` : hasHint ? `${id}-hint` : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field id="fullName" label="Full name" error={errors.fullName}
        hint={kind === 'student' ? 'Your teacher sees this name in exam results.' : 'Shown to students and in the admin list.'}>
        <input
          id="fullName" type="text" value={fullName} autoComplete="name" autoFocus
          onChange={(e) => setFullName(e.target.value)}
          className={inputClass} placeholder="e.g. Aziza Rahimova"
          aria-invalid={!!errors.fullName} aria-describedby={describedBy('fullName', true)}
        />
      </Field>

      <Field id="university" label="University" error={errors.university}>
        <select
          id="university" value={universityChoice}
          onChange={(e) => setUniversityChoice(e.target.value)}
          className={inputClass}
          aria-invalid={!!errors.university} aria-describedby={describedBy('university')}
        >
          <option value="" disabled>Choose…</option>
          {UNIVERSITIES.map(u => <option key={u} value={u}>{u}</option>)}
          <option value={OTHER}>Other…</option>
        </select>
        {universityChoice === OTHER && (
          <input
            type="text" value={universityOther} aria-label="University name"
            onChange={(e) => setUniversityOther(e.target.value)}
            className={`${inputClass} mt-2`} placeholder="University name"
          />
        )}
      </Field>

      {kind === 'student' ? (
        <>
          <Field id="course" label="Year of study" error={errors.course}>
            <select
              id="course" value={course} onChange={(e) => setCourse(e.target.value)}
              className={inputClass}
              aria-invalid={!!errors.course} aria-describedby={describedBy('course')}
            >
              <option value="" disabled>Choose…</option>
              {COURSES.map(c => <option key={c} value={c}>Year {c}</option>)}
            </select>
          </Field>

          <Field id="group" label="Group number (optional)" hint="As written in your timetable, e.g. 312.">
            <input
              id="group" type="text" value={group} onChange={(e) => setGroup(e.target.value)}
              className={inputClass} placeholder="312" aria-describedby="group-hint"
            />
          </Field>

          {askGroupCode && !invited && (
            <Field id="groupCode" label="Class code from your teacher (optional)" error={errors.groupCode}
              hint="Skip it if you do not have one. You can enter it later on your dashboard.">
              <input
                id="groupCode" type="text" value={groupCode} autoCapitalize="characters" autoComplete="off"
                onChange={(e) => setGroupCode(e.target.value)}
                className={`${inputClass} font-mono tracking-wider`} placeholder="ABCD-2345"
                aria-invalid={!!errors.groupCode} aria-describedby={describedBy('groupCode', true)}
              />
            </Field>
          )}
          {askGroupCode && invited && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
              You will be added to your class group from the invite link as soon as you save.
            </p>
          )}
        </>
      ) : (
        <Field id="department" label="Department" error={errors.department}>
          <input
            id="department" type="text" value={department} onChange={(e) => setDepartment(e.target.value)}
            className={inputClass} placeholder="e.g. Normal physiology"
            aria-invalid={!!errors.department} aria-describedby={describedBy('department')}
          />
        </Field>
      )}

      {errors.form && <p role="alert" className="text-sm text-red-600">{errors.form}</p>}

      <button
        type="submit" disabled={loading}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 mt-2 min-h-[44px]"
      >
        {loading ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
