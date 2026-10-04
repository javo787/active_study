'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { RotateCcw, UserMinus } from 'lucide-react';
import { GroupMember, RemovedMember } from '@/types';
import { fetchMembers, fetchRemoved, removeMember, restoreMember } from '@/lib/groups';
import { toDate } from '@/lib/time';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface MembersPanelProps {
  groupId: string;
  groupName: string;
  /** Reports the number of listed members so the card can show it. */
  onCount?: (count: number) => void;
}

export function MembersPanel({ groupId, groupName, onCount }: MembersPanelProps) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [removed, setRemoved] = useState<RemovedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [toRemove, setToRemove] = useState<GroupMember | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [m, r] = await Promise.all([fetchMembers(groupId), fetchRemoved(groupId)]);
      setMembers(m);
      setRemoved(r);
      onCount?.(m.length);
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [groupId, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmRemove = async () => {
    if (!toRemove) return;
    setBusy(true);
    try {
      await removeMember(groupId, toRemove);
      toast.success(`${toRemove.name || 'Student'} removed`);
      setToRemove(null);
      await load();
    } catch (error) {
      console.error(error);
      toast.error('Could not remove the student');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (member: RemovedMember) => {
    setBusy(true);
    try {
      await restoreMember(groupId, member.uid);
      toast.success(`${member.name || 'Student'} can join again with the code`);
      await load();
    } catch (error) {
      console.error(error);
      toast.error('Could not restore the student');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="h-16 bg-slate-100 rounded-md animate-pulse" aria-busy="true" />;

  if (failed) {
    return (
      <div className="text-sm text-slate-600 space-y-2">
        <p>Could not load the members.</p>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-h-[44px]">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {members.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nobody is listed yet. Students who joined before this list existed appear here the next time they open the app.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
          {members.map(member => {
            const joined = toDate(member.joinedAt);
            return (
              <li key={member.uid} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{member.name || 'Unnamed student'}</p>
                  {joined && <p className="text-xs text-slate-500">Joined {joined.toLocaleDateString()}</p>}
                </div>
                <button
                  onClick={() => setToRemove(member)}
                  disabled={busy}
                  aria-label={`Remove ${member.name || 'student'} from ${groupName}`}
                  className="text-slate-400 hover:text-red-600 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
                >
                  <UserMinus className="w-5 h-5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {removed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Removed</p>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md bg-slate-50">
            {removed.map(member => (
              <li key={member.uid} className="flex items-center justify-between gap-3 px-3 py-2">
                <p className="text-sm text-slate-600 truncate">{member.name || 'Unnamed student'}</p>
                <button
                  onClick={() => restore(member)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-200 min-h-[44px] disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" /> Let back in
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        isOpen={toRemove !== null}
        title="Remove student"
        isDestructive
        confirmText={busy ? 'Removing...' : 'Remove'}
        confirmDisabled={busy}
        message={
          <p>
            {toRemove?.name || 'This student'} loses access to the exams of {groupName} and cannot join again with the code
            until you let them back in.
          </p>
        }
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
