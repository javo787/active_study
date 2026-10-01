'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Copy, Link2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Group } from '@/types';
import { createGroup, deleteGroup, fetchOwnedGroups, formatJoinCode, inviteLink } from '@/lib/groups';

export default function TeacherGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
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

  const handleDelete = async (group: Group) => {
    if (!window.confirm(`Delete "${group.name}"? Students will stop seeing exams assigned only to this group.`)) return;
    try {
      await deleteGroup(group.id);
      setGroups(prev => prev.filter(g => g.id !== group.id));
      toast.success('Group deleted');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete group');
    }
  };

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
        <input
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

      {loading ? (
        <div className="h-24 bg-slate-200 rounded-lg animate-pulse" />
      ) : groups.length === 0 ? (
        <p className="text-slate-500">You have no groups yet.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map(group => (
            <li key={group.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-800">{group.name}</h3>
                <button
                  onClick={() => handleDelete(group)}
                  aria-label={`Delete ${group.name}`}
                  className="text-slate-400 hover:text-red-600 p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
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
    </div>
  );
}
