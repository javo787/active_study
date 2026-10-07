'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { Check, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  TeacherRequests, approveTeacherRequest, canAnswerRequests, declineTeacherRequest, fetchTeacherRequests,
} from '@/lib/teacherRequests';
import { User } from '@/types';

// Telegram sign-ins have no e-mail and often no display name, so lean on what the person typed in onboarding.
const personName = (u: User) => u.fullName || u.displayName || '—';

export default function TeacherRequestsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [requests, setRequests] = useState<TeacherRequests | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showDeclined, setShowDeclined] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequests(await fetchTeacherRequests());
      setFailed(false);
    } catch (error) {
      console.error('Could not load teacher requests', error);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (canAnswerRequests(user)) void load();
  }, [user, load]);

  // The layout sends everybody else away; until then show nothing instead of a flash of someone else's page.
  if (!user || !canAnswerRequests(user)) return null;

  const answer = async (person: User, approve: boolean) => {
    setBusyId(person.uid);
    try {
      if (approve) await approveTeacherRequest(person.uid, user.uid);
      else await declineTeacherRequest(person.uid);
      toast.success(t(approve ? 'requests.approved' : 'requests.declined', { name: personName(person) }));
      await load();
    } catch (error) {
      console.error('Could not answer the request', error);
      toast.error(t('requests.error'));
    } finally {
      setBusyId(null);
    }
  };

  const row = (person: User, mayDecline: boolean) => (
    <li key={person.uid} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-ink break-words">{personName(person)}</p>
        <p className="text-sm text-slate-500">
          {[person.department, person.university].filter(Boolean).join(' · ') || t('requests.no_details')}
        </p>
        <p className="text-xs text-slate-400 truncate">{person.email || t('requests.telegram')}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => answer(person, true)}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          <Check className="w-4 h-4" aria-hidden="true" /> {t('requests.approve')}
        </button>
        {mayDecline && (
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => answer(person, false)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-md border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            <X className="w-4 h-4" aria-hidden="true" /> {t('requests.decline')}
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title={t('requests.title')} description={t('requests.intro')} />

      {failed && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3">
          <span>{t('requests.load_failed')}</span>
          <button type="button" onClick={() => void load()} className="min-h-[44px] px-4 rounded-md border border-red-300 font-medium hover:bg-red-100">
            {t('requests.retry')}
          </button>
        </div>
      )}

      {!requests && !failed && (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">{t('common.loading', 'Loading')}</span>
          {[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {requests && requests.pending.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{t('requests.empty')}</p>
      )}

      {requests && requests.pending.length > 0 && (
        <ul className="space-y-3" aria-label={t('requests.title')}>{requests.pending.map(p => row(p, true))}</ul>
      )}

      {requests && requests.declined.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowDeclined(v => !v)}
            aria-expanded={showDeclined}
            className="text-sm font-medium text-slate-600 hover:text-ink min-h-[44px] underline-offset-4 hover:underline"
          >
            {t('requests.declined_title', { count: requests.declined.length })}
          </button>
          {showDeclined && (
            <>
              <p className="text-sm text-slate-500 mb-3">{t('requests.declined_hint')}</p>
              <ul className="space-y-3">{requests.declined.map(p => row(p, false))}</ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
