'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Group } from '@/types';
import { createGroup, deleteGroupCascade, fetchGroupExams, fetchOwnedGroups, migrateLegacyGroup, planGroupDeletion, setGroupArchived } from '@/lib/groups';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { GroupCard } from '@/components/groups/GroupCard';

export default function TeacherGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
  const [deletingExams, setDeletingExams] = useState<{ loading: boolean; error: boolean; unpublish: string[]; detach: string[] }>({ loading: false, error: false, unpublish: [], detach: [] });
  const [showArchived, setShowArchived] = useState(false);
  const scrolledToHash = useRef(false);
  const deleteRequestRef = useRef(0);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const owned = await fetchOwnedGroups(user.uid);
      setGroups(owned);
      // Groups created before the rework become current ones (same code), one at a time and without blocking the page.
      for (const group of owned.filter(g => !g.joinCode)) {
        migrateLegacyGroup(group)
          .then(migrated => {
            if (migrated.joinCode) setGroups(prev => prev.map(g => g.id === migrated.id ? migrated : g));
          })
          .catch(console.error);
      }
    } catch (error) {
      console.error(error);
      setError(true);
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setCreating(true);
    try {
      const group = await createGroup({ uid: user.uid, name: user.fullName || user.displayName }, name);
      setGroups(prev => [...prev, group].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      toast.success('Group created');
    } catch (error) {
      console.error(error);
      toast.error('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const requestDelete = async (group: Group) => {
    if (!user) return;
    const requestId = ++deleteRequestRef.current;
    setGroupToDelete(group);
    setDeletingExams({ loading: true, error: false, unpublish: [], detach: [] });
    try {
      const exams = await fetchGroupExams(user.uid, group.id);
      // The teacher closed the dialog or opened another group meanwhile: this answer is stale.
      if (requestId !== deleteRequestRef.current) return;
      const { unpublishIds, detachIds } = planGroupDeletion(group.id, exams);

      const unpublishTitles = unpublishIds.map(id => exams.find(e => e.id === id)?.title ?? id);
      const detachTitles = detachIds.map(id => exams.find(e => e.id === id)?.title ?? id);

      setDeletingExams({ loading: false, error: false, unpublish: unpublishTitles, detach: detachTitles });
    } catch {
      if (requestId !== deleteRequestRef.current) return;
      setDeletingExams(prev => ({ ...prev, loading: false, error: true }));
    }
  };

  const cancelDelete = () => {
    deleteRequestRef.current++;
    setGroupToDelete(null);
  };

  const handleDelete = async () => {
    if (!groupToDelete || deletingExams.error || !user) return;
    const group = groupToDelete;
    try {
      const exams = await fetchGroupExams(user.uid, group.id);
      const { unpublished } = await deleteGroupCascade(group, exams);

      setGroups(prev => prev.filter(g => g.id !== group.id));
      toast.success(`Group deleted. ${unpublished} exam(s) unpublished.`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete group');
    } finally {
      cancelDelete();
    }
  };

  const toggleArchive = async (group: Group) => {
    try {
      const newArchived = !group.archived;
      await setGroupArchived(group.id, newArchived);
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, archived: newArchived } : g));
      toast.success(newArchived ? 'Group archived' : 'Group restored');
    } catch {
      toast.error('Could not update group');
    }
  };

  // A link from an exam card names one group: show the list it is in, then scroll to it.
  useEffect(() => {
    if (loading || scrolledToHash.current || groups.length === 0) return;
    const id = window.location.hash.slice(1);
    const target = groups.find(g => `group-${g.id}` === id);
    if (!target) return;
    if (!!target.archived !== showArchived) {
      setShowArchived(!!target.archived);
      return;
    }
    scrolledToHash.current = true;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'center' }));
  }, [loading, groups, showArchived]);

  const activeGroups = groups.filter(g => !g.archived);
  const archivedGroups = groups.filter(g => g.archived);
  const displayedGroups = showArchived ? archivedGroups : activeGroups;

  return (
    <div className="max-w-3xl space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">My groups</h2>
        <p className="text-slate-500 text-sm mt-1">
          Create a group per class, give students the code or the link, then pick the group when you create an exam.
          Only students in that group will see the exam.
        </p>
      </div>

      <form onSubmit={handleCreate} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3">
        <label htmlFor="createGroup" className="sr-only">Create group</label>
        <input
          id="createGroup"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={80}
          placeholder="e.g. Anatomy, 3rd year, group 12"
          className="flex-1 rounded-md border border-slate-300 p-2 min-h-[44px]"
          required
        />
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 min-h-[44px] disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating...' : 'Create group'}
        </button>
      </form>

      {archivedGroups.length > 0 && (
        <div className="flex justify-end">
          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-slate-600">Show archived ({archivedGroups.length})</span>
          </label>
        </div>
      )}

      {loading ? (
        <div className="h-24 bg-slate-200 rounded-lg animate-pulse" />
      ) : error ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-slate-600">Could not load your groups. Please check your connection.</p>
          <button onClick={load} className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-h-[44px]">Try again</button>
        </div>
      ) : displayedGroups.length === 0 ? (
        <EmptyState
          icon={Users}
          title={showArchived ? "No archived groups" : "No groups yet"}
          description={showArchived ? "" : "Create a group to start assigning exams to specific classes."}
          actionText={showArchived ? undefined : "Create group"}
          onAction={() => document.getElementById('createGroup')?.focus()}
        />
      ) : (
        <ul className="space-y-3">
          {displayedGroups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              onChange={updated => setGroups(prev => prev.map(g => g.id === updated.id ? updated : g))}
              onToggleArchive={toggleArchive}
              onDelete={requestDelete}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={groupToDelete !== null}
        title="Delete Group"
        isDestructive={true}
        confirmText={deletingExams.loading ? 'Checking exams...' : 'Delete group'}
        confirmDisabled={deletingExams.loading || deletingExams.error}
        message={
          <div className="space-y-4">
            <p className="font-medium text-slate-700">Students in this group lose access to its exams.</p>
            {deletingExams.error ? (
              <p className="text-red-600">Could not check exams. Try again.</p>
            ) : deletingExams.loading ? (
              <p className="text-slate-500 animate-pulse">Checking exams...</p>
            ) : (deletingExams.unpublish.length === 0 && deletingExams.detach.length === 0) ? (
              <p className="text-slate-500">No exams use this group.</p>
            ) : (
              <div className="space-y-3">
                {deletingExams.unpublish.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Will be unpublished (this was their only group):</p>
                    <ul className="list-disc pl-5 text-slate-600 space-y-1">
                      {deletingExams.unpublish.slice(0, 5).map(t => <li key={t}>{t}</li>)}
                      {deletingExams.unpublish.length > 5 && <li>and {deletingExams.unpublish.length - 5} more</li>}
                    </ul>
                  </div>
                )}
                {deletingExams.detach.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Will stay published for other groups:</p>
                    <ul className="list-disc pl-5 text-slate-600 space-y-1">
                      {deletingExams.detach.slice(0, 5).map(t => <li key={t}>{t}</li>)}
                      {deletingExams.detach.length > 5 && <li>and {deletingExams.detach.length - 5} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        }
        onConfirm={handleDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
