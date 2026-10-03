'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Archive, Copy, Link2, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Group } from '@/types';
import { createGroup, deleteGroupCascade, fetchGroupExams, fetchOwnedGroups, formatJoinCode, inviteLink, planGroupDeletion, setGroupArchived } from '@/lib/groups';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';

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

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      setGroups(await fetchOwnedGroups(user.uid));
    } catch (error) {
      console.error(error);
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

  const copy = async (text: string, okMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMessage);
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.');
    }
  };

  const requestDelete = async (group: Group) => {
    if (!user) return;
    setGroupToDelete(group);
    setDeletingExams({ loading: true, error: false, unpublish: [], detach: [] });
    try {
      const exams = await fetchGroupExams(user.uid, group.id);
      const { unpublishIds, detachIds } = planGroupDeletion(group.id, exams);

      const unpublishTitles = unpublishIds.map(id => exams.find(e => e.id === id)?.title ?? id);
      const detachTitles = detachIds.map(id => exams.find(e => e.id === id)?.title ?? id);

      setDeletingExams({ loading: false, error: false, unpublish: unpublishTitles, detach: detachTitles });
    } catch {
      setDeletingExams(prev => ({ ...prev, loading: false, error: true }));
    }
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
      setGroupToDelete(null);
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
            <li key={group.id} className={`bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3 ${group.archived ? 'opacity-75' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  {group.name}
                  {group.archived && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Archived</span>}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleArchive(group)}
                    aria-label={`${group.archived ? 'Restore' : 'Archive'} ${group.name}`}
                    className="text-slate-400 hover:text-slate-600 p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    {group.archived ? <RefreshCw className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => requestDelete(group)}
                    aria-label={`Delete ${group.name}`}
                    className="text-slate-400 hover:text-red-600 p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="font-mono text-2xl tracking-widest text-slate-900 bg-slate-100 rounded-md px-3 py-1 self-start">
                  {formatJoinCode(group.id)}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => copy(group.id, 'Code copied')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 min-h-[44px] text-sm"
                  >
                    <Copy className="w-4 h-4" /> Copy code
                  </button>
                  <button
                    onClick={() => copy(inviteLink(group.id), 'Invite link copied')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 min-h-[44px] text-sm"
                  >
                    <Link2 className="w-4 h-4" /> Copy invite link
                  </button>
                </div>
              </div>
            </li>
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
        onCancel={() => setGroupToDelete(null)}
      />
    </div>
  );
}
