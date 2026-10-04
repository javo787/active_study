'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Group, User } from '@/types';
import { fetchGroupsByIds, fetchOwnedGroups } from '@/lib/groups';
import { Pill } from '@/components/ui/Pill';

interface UserGroupsProps {
  user: Pick<User, 'uid' | 'role' | 'groupIds'>;
}

/** The groups of one person: those a teacher owns, or those a student is in. Loaded when the admin asks. */
export function UserGroups({ user }: UserGroupsProps) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [missing, setMissing] = useState(0);
  const [failed, setFailed] = useState(false);

  const owns = user.role === 'teacher' || user.role === 'admin';

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || groups) return;
    setFailed(false);
    try {
      if (owns) {
        setGroups(await fetchOwnedGroups(user.uid));
      } else {
        const result = await fetchGroupsByIds(user.groupIds ?? []);
        setGroups(result.groups);
        setMissing(result.missingIds.length);
      }
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  };

  const hasNone = !owns && (user.groupIds ?? []).length === 0;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="text-sm text-blue-700 hover:underline min-h-[32px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
      >
        {open ? 'Hide groups' : owns ? 'Groups they teach' : 'Groups they are in'}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-live="polite">
          {failed ? (
            <span className="text-sm text-slate-500">Could not load the groups.</span>
          ) : groups === null && !hasNone ? (
            <span className="text-sm text-slate-500 animate-pulse">Loading...</span>
          ) : (groups ?? []).length === 0 && missing === 0 ? (
            <span className="text-sm text-slate-500">{owns ? 'No groups yet.' : 'Not in any group.'}</span>
          ) : (
            <>
              {(groups ?? []).map(g => (
                <Link key={g.id} href={`/dashboard/admin/groups#group-${g.id}`} className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                  <Pill tone={g.archived ? 'neutral' : 'info'} className="hover:opacity-80">{g.name}</Pill>
                </Link>
              ))}
              {missing > 0 && <Pill tone="neutral">{missing} deleted</Pill>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
