'use client';

import { useCallback, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Archive, Copy, KeyRound, Link2, MonitorUp, Pencil, RefreshCw, Trash2, Users } from 'lucide-react';
import { Group } from '@/types';
import { formatJoinCode, groupCode, inviteLink, rotateJoinCode, setGroupJoinOpen, updateGroupDetails } from '@/lib/groups';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MembersPanel } from './MembersPanel';
import { ShowToClassDialog } from './ShowToClassDialog';

interface GroupCardProps {
  group: Group;
  onChange: (group: Group) => void;
  onToggleArchive: (group: Group) => void;
  onDelete: (group: Group) => void;
}

async function copy(text: string, okMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
  } catch {
    toast.error('Could not copy. Select the text and copy it manually.');
  }
}

export function GroupCard({ group, onChange, onToggleArchive, onDelete }: GroupCardProps) {
  const code = groupCode(group);
  // Groups created before the rework are upgraded in the background by the page; until then the code tools wait.
  const upgraded = Boolean(group.joinCode);
  const open = group.joinOpen !== false;

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const [draftDescription, setDraftDescription] = useState(group.description ?? '');
  const [saving, setSaving] = useState(false);

  const [showMembers, setShowMembers] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [busy, setBusy] = useState(false);

  const onCount = useCallback((count: number) => setMemberCount(count), []);

  const startEdit = () => {
    setDraftName(group.name);
    setDraftDescription(group.description ?? '');
    setEditing(true);
  };

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim()) return;
    setSaving(true);
    try {
      const details = await updateGroupDetails(group.id, { name: draftName, description: draftDescription });
      onChange({ ...group, ...details });
      setEditing(false);
    } catch (error) {
      console.error(error);
      toast.error('Could not save the group');
    } finally {
      setSaving(false);
    }
  };

  const toggleOpen = async () => {
    setBusy(true);
    try {
      await setGroupJoinOpen(group.id, !open);
      onChange({ ...group, joinOpen: !open });
      toast.success(open ? 'New students can no longer join' : 'New students can join again');
    } catch (error) {
      console.error(error);
      toast.error('Could not change the setting');
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const next = await rotateJoinCode(group);
      onChange({ ...group, joinCode: next });
      toast.success('New code created. The old code and link no longer work.');
      setConfirmRotate(false);
    } catch (error) {
      console.error(error);
      toast.error('Could not create a new code');
    } finally {
      setBusy(false);
    }
  };

  const iconButton = 'text-slate-400 p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center';
  const lightButton = 'inline-flex items-center gap-2 px-3 py-2 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 min-h-[44px] text-sm disabled:opacity-50';

  return (
    <li className={`bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-4 ${group.archived ? 'opacity-75' : ''}`}>
      {editing ? (
        <form onSubmit={saveDetails} className="space-y-3">
          <div>
            <label htmlFor={`name-${group.id}`} className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              id={`name-${group.id}`}
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              maxLength={80}
              required
              className="w-full rounded-md border border-slate-300 p-2 min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor={`desc-${group.id}`} className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
            <input
              id={`desc-${group.id}`}
              value={draftDescription}
              onChange={e => setDraftDescription(e.target.value)}
              maxLength={200}
              placeholder="e.g. Autumn term, Mondays 9:00"
              className="w-full rounded-md border border-slate-300 p-2 min-h-[44px]"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-h-[44px] disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 border border-slate-300 rounded-md hover:bg-slate-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 flex flex-wrap items-center gap-2">
              {group.name}
              {group.archived && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Archived</span>}
              {upgraded && !open && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Joining closed</span>}
            </h3>
            {group.description && <p className="text-sm text-slate-500 mt-0.5">{group.description}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={startEdit} aria-label={`Edit ${group.name}`} className={`${iconButton} hover:text-slate-600`}>
              <Pencil className="w-5 h-5" />
            </button>
            <button onClick={() => onToggleArchive(group)} aria-label={`${group.archived ? 'Restore' : 'Archive'} ${group.name}`} className={`${iconButton} hover:text-slate-600`}>
              {group.archived ? <RefreshCw className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
            </button>
            <button onClick={() => onDelete(group)} aria-label={`Delete ${group.name}`} className={`${iconButton} hover:text-red-600`}>
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="font-mono text-2xl tracking-widest text-slate-900 bg-slate-100 rounded-md px-3 py-1 self-start">
          {formatJoinCode(code)}
        </span>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => copy(code, 'Code copied')} className={lightButton}>
            <Copy className="w-4 h-4" /> Copy code
          </button>
          <button onClick={() => copy(inviteLink(code), 'Invite link copied')} className={lightButton}>
            <Link2 className="w-4 h-4" /> Copy invite link
          </button>
          <button onClick={() => setPresenting(true)} className={lightButton}>
            <MonitorUp className="w-4 h-4" /> Show to class
          </button>
        </div>
      </div>

      {upgraded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <button
              type="button"
              role="switch"
              aria-checked={open}
              aria-label="Accepting new students"
              onClick={toggleOpen}
              disabled={busy}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${open ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${open ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-slate-700">Accepting new students</span>
          </label>
          <button onClick={() => setConfirmRotate(true)} disabled={busy} className={`${lightButton} self-start sm:self-auto`}>
            <KeyRound className="w-4 h-4" /> New code
          </button>
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <button
          onClick={() => setShowMembers(v => !v)}
          aria-expanded={showMembers}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 min-h-[44px]"
        >
          <Users className="w-4 h-4" />
          Students{memberCount !== null ? ` (${memberCount})` : ''}
        </button>
        {showMembers && (
          <div className="mt-2">
            <MembersPanel groupId={group.id} groupName={group.name} onCount={onCount} />
          </div>
        )}
      </div>

      {presenting && <ShowToClassDialog groupName={group.name} code={code} onClose={() => setPresenting(false)} />}

      <ConfirmDialog
        isOpen={confirmRotate}
        title="Create a new code"
        isDestructive
        confirmText={busy ? 'Creating...' : 'Create new code'}
        confirmDisabled={busy}
        message={
          <p>
            The current code, every link and every QR code made from it stop working right away. Students already in
            the group stay. Use this if the code was shared with someone who should not have it.
          </p>
        }
        onConfirm={rotate}
        onCancel={() => setConfirmRotate(false)}
      />
    </li>
  );
}
