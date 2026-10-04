'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { Layers } from 'lucide-react';
import { db } from '@/lib/firebase';
import { Group, User } from '@/types';
import {
  chunk,
  countMembers,
  fetchAllGroups,
  groupCode,
  formatJoinCode,
  setGroupArchived,
  setJoinOpenForGroup,
  transferGroupOwner,
} from '@/lib/groups';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { Segmented } from '@/components/ui/Segmented';
import { StatStrip } from '@/components/ui/StatStrip';
import { btnQuiet, field, fieldLabel, surface } from '@/components/ui/styles';

type Filter = 'all' | 'active' | 'closed' | 'archived' | 'orphan';

/** What the admin needs to know about an owner; null when the account no longer exists. */
type Owner = { name: string; role: string } | null;

const personName = (u: Pick<User, 'fullName' | 'displayName'>) => u.fullName || u.displayName || 'Unnamed';

function statusOf(group: Group): 'active' | 'closed' | 'archived' {
  if (group.archived) return 'archived';
  if (group.joinCode && group.joinOpen === false) return 'closed';
  return 'active';
}

async function loadOwners(ids: string[]): Promise<Record<string, Owner>> {
  const result: Record<string, Owner> = {};
  for (const part of chunk(ids, 10)) {
    await Promise.all(part.map(async id => {
      try {
        const snap = await getDoc(doc(db, 'users', id));
        const data = snap.data();
        result[id] = snap.exists() && data ? { name: personName(data as User), role: String(data.role) } : null;
      } catch {
        // Unreadable is not the same as gone: leave it out and the row shows no verdict.
      }
    }));
  }
  return result;
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [owners, setOwners] = useState<Record<string, Owner>>({});
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [transferFor, setTransferFor] = useState<Group | null>(null);
  const [teachers, setTeachers] = useState<User[] | null>(null);
  const [pickedTeacher, setPickedTeacher] = useState('');
  const [transferring, setTransferring] = useState(false);
  const scrolled = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const all = await fetchAllGroups();
      setGroups(all);
      setLoading(false);
      // Owners and member counts fill in afterwards; the list is useful without them.
      loadOwners(Array.from(new Set(all.map(g => g.ownerId)))).then(setOwners).catch(console.error);
      (async () => {
        for (const part of chunk(all, 6)) {
          const results = await Promise.all(part.map(async g => [g.id, await countMembers(g.id).catch(() => null)] as const));
          setCounts(prev => ({ ...prev, ...Object.fromEntries(results) }));
        }
      })();
    } catch (error) {
      console.error(error);
      setFailed(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ownerGone = useCallback((g: Group) => {
    const owner = owners[g.ownerId];
    return owner === null || (owner !== undefined && owner.role !== 'teacher' && owner.role !== 'admin');
  }, [owners]);

  const tallies = useMemo(() => ({
    all: groups.length,
    active: groups.filter(g => statusOf(g) === 'active').length,
    closed: groups.filter(g => statusOf(g) === 'closed').length,
    archived: groups.filter(g => statusOf(g) === 'archived').length,
    orphan: groups.filter(ownerGone).length,
  }), [groups, ownerGone]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter(g => {
      if (filter === 'orphan' ? !ownerGone(g) : filter !== 'all' && statusOf(g) !== filter) return false;
      if (!q) return true;
      const ownerName = owners[g.ownerId]?.name ?? g.ownerName ?? '';
      return g.name.toLowerCase().includes(q) || ownerName.toLowerCase().includes(q);
    });
  }, [groups, filter, search, owners, ownerGone]);

  // A link from an exam card or elsewhere lands on one group: make sure it is in the list, then scroll to it.
  useEffect(() => {
    if (loading || scrolled.current || groups.length === 0) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    const target = groups.find(g => `group-${g.id}` === id);
    if (!target) return;
    if (filter !== 'all') {
      setFilter('all');
      return;
    }
    scrolled.current = true;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'center' }));
  }, [loading, groups, filter]);

  const patch = (id: string, changes: Partial<Group>) =>
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, ...changes } : g)));

  const toggleArchive = async (group: Group) => {
    setBusyId(group.id);
    try {
      await setGroupArchived(group.id, !group.archived);
      patch(group.id, { archived: !group.archived });
      toast.success(group.archived ? 'Group restored' : 'Group archived');
    } catch (error) {
      console.error(error);
      toast.error('Could not update the group');
    } finally {
      setBusyId(null);
    }
  };

  const toggleJoining = async (group: Group) => {
    const open = group.joinOpen === false;
    setBusyId(group.id);
    try {
      const updated = await setJoinOpenForGroup(group, open);
      patch(group.id, { joinCode: updated.joinCode, joinOpen: updated.joinOpen });
      toast.success(open ? 'New students can join again' : 'New students can no longer join');
    } catch (error) {
      console.error(error);
      toast.error('Could not change joining for this group');
    } finally {
      setBusyId(null);
    }
  };

  const openTransfer = async (group: Group) => {
    setTransferFor(group);
    setPickedTeacher('');
    if (teachers) return;
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
      setTeachers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as User)).sort((a, b) => personName(a).localeCompare(personName(b))));
    } catch (error) {
      console.error(error);
      toast.error('Could not load the teachers');
      setTransferFor(null);
    }
  };

  const confirmTransfer = async () => {
    const teacher = teachers?.find(t => t.uid === pickedTeacher);
    if (!transferFor || !teacher) return;
    setTransferring(true);
    try {
      await transferGroupOwner(transferFor.id, { uid: teacher.uid, name: personName(teacher) });
      patch(transferFor.id, { ownerId: teacher.uid, ownerName: personName(teacher) });
      setOwners(prev => ({ ...prev, [teacher.uid]: { name: personName(teacher), role: 'teacher' } }));
      toast.success(`${transferFor.name} now belongs to ${personName(teacher)}`);
      setTransferFor(null);
    } catch (error) {
      console.error(error);
      toast.error('Could not hand the group over');
    } finally {
      setTransferring(false);
    }
  };

  const candidates = (teachers ?? []).filter(t => t.uid !== transferFor?.ownerId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Every group on the platform. When a teacher has left, hand their groups to someone else so the students keep their class."
      />

      <StatStrip
        stats={[
          { label: 'Groups', value: tallies.all },
          { label: 'Accepting students', value: tallies.active },
          { label: 'Closed or archived', value: tallies.closed + tallies.archived },
          { label: 'Need an owner', value: tallies.orphan, note: tallies.orphan > 0 ? 'The teacher account is gone' : undefined },
        ]}
      />

      <section aria-label="Filters" className={`${surface} p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4`}>
        <Segmented<Filter>
          label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: tallies.all },
            { value: 'active', label: 'Open', count: tallies.active },
            { value: 'closed', label: 'Closed', count: tallies.closed },
            { value: 'archived', label: 'Archived', count: tallies.archived },
            { value: 'orphan', label: 'No owner', count: tallies.orphan },
          ]}
        />
        <div className="lg:w-72">
          <label htmlFor="group-search" className={fieldLabel}>Find a group or teacher</label>
          <input id="group-search" type="search" value={search} onChange={e => setSearch(e.target.value)} className={field} placeholder="Name" />
        </div>
      </section>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : failed ? (
        <div className={`${surface} p-8 text-center space-y-3`}>
          <p className="text-slate-600">Could not load the groups. Check your connection.</p>
          <button onClick={load} className={btnQuiet}>Try again</button>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={groups.length === 0 ? 'No groups yet' : 'No group matches'}
          description={groups.length === 0 ? 'Groups appear here when teachers create them.' : 'Change the status or the search.'}
        />
      ) : (
        <ul className="space-y-3">
          {shown.map(group => {
            const status = statusOf(group);
            const owner = owners[group.ownerId];
            const gone = ownerGone(group);
            const count = counts[group.id];
            const busy = busyId === group.id;
            return (
              <li
                key={group.id}
                id={`group-${group.id}`}
                className={`${surface} scroll-mt-24 target:ring-2 target:ring-blue-400 p-4 flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4 ${status === 'archived' ? 'opacity-80' : ''}`}
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-ink">{group.name}</h2>
                    {status === 'active' && <Pill tone="good" dot>Open</Pill>}
                    {status === 'closed' && <Pill tone="warn" dot>Joining closed</Pill>}
                    {status === 'archived' && <Pill tone="neutral">Archived</Pill>}
                    {gone && <Pill tone="flag" dot>No owner</Pill>}
                    {!group.joinCode && <Pill tone="neutral">Not upgraded</Pill>}
                  </div>
                  {group.description && <p className="text-sm text-slate-500">{group.description}</p>}
                  <p className="text-sm text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {gone
                      ? <span className="text-flag">Owner account removed</span>
                      : <span>Teacher: <span className="text-ink">{owner?.name ?? group.ownerName ?? 'Unknown'}</span></span>}
                    <span className="tnum">
                      {count === undefined ? 'Counting students...' : count === null ? 'Students: not available' : `${count} ${count === 1 ? 'student' : 'students'}`}
                    </span>
                    <span className="font-mono text-xs tracking-wider text-slate-500">{formatJoinCode(groupCode(group))}</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <button onClick={() => openTransfer(group)} disabled={busy} className={gone ? `${btnQuiet} border-flag text-flag hover:bg-red-50` : btnQuiet}>
                    Hand over
                  </button>
                  <button onClick={() => toggleJoining(group)} disabled={busy || status === 'archived'} className={btnQuiet}>
                    {group.joinOpen === false ? 'Open joining' : 'Close joining'}
                  </button>
                  <button onClick={() => toggleArchive(group)} disabled={busy} className={btnQuiet}>
                    {group.archived ? 'Restore' : 'Archive'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-slate-400">
        Student counts include everyone who joined since member lists were introduced, and older students once they open the app.
      </p>

      <ConfirmDialog
        isOpen={transferFor !== null}
        title="Hand the group to another teacher"
        confirmText={transferring ? 'Handing over...' : 'Hand over'}
        confirmDisabled={transferring || !pickedTeacher}
        message={
          <div className="space-y-3">
            <p>
              The new teacher gets <strong>{transferFor?.name}</strong>, its students and its code. Exams already linked to the
              group stay with the teachers who wrote them.
            </p>
            {teachers === null ? (
              <p className="animate-pulse">Loading teachers...</p>
            ) : candidates.length === 0 ? (
              <p>There is no other teacher to hand it to yet.</p>
            ) : (
              <div>
                <label htmlFor="new-owner" className={fieldLabel}>New teacher</label>
                <select id="new-owner" value={pickedTeacher} onChange={e => setPickedTeacher(e.target.value)} className={field}>
                  <option value="">Choose a teacher</option>
                  {candidates.map(t => (
                    <option key={t.uid} value={t.uid}>
                      {personName(t)}{t.university || t.department ? ` (${[t.department, t.university].filter(Boolean).join(', ')})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        }
        onConfirm={confirmTransfer}
        onCancel={() => setTransferFor(null)}
      />
    </div>
  );
}
