'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Group } from '@/types';
import { JoinGroupError, JoinPreview, formatJoinInput, previewJoin } from '@/lib/groups';
import { JoinCard } from './JoinCard';

interface JoinByCodeProps {
  /** A code remembered from an invite link opened before signing in: shown as the same confirmation card. */
  initialCode?: string | null;
  onJoined?: (group: Group) => void;
}

export function JoinByCode({ initialCode, onJoined }: JoinByCodeProps) {
  const { user, joinGroup } = useAuth();
  const [value, setValue] = useState(() => formatJoinInput(initialCode ?? ''));
  const [looking, setLooking] = useState(false);
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoLookedUp = useRef(false);

  const lookUp = useCallback(async (code: string) => {
    if (!user || !code.trim()) return;
    setLooking(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await previewJoin({ uid: user.uid, name: user.fullName || user.displayName, groupIds: user.groupIds }, code));
    } catch (err) {
      setError(err instanceof JoinGroupError ? err.message : 'Could not look the code up. Check your connection and try again.');
    } finally {
      setLooking(false);
    }
  }, [user]);

  useEffect(() => {
    if (!initialCode || autoLookedUp.current || !user) return;
    autoLookedUp.current = true;
    lookUp(initialCode);
  }, [initialCode, user, lookUp]);

  const confirmJoin = async () => {
    if (!preview) return;
    setJoining(true);
    setError(null);
    try {
      const group = await joinGroup(preview.code);
      toast.success(`You joined ${group.name}`);
      setPreview(null);
      setValue('');
      onJoined?.(group);
    } catch (err) {
      setPreview(null);
      setError(err instanceof JoinGroupError ? err.message : 'Could not join the group. Try again.');
    } finally {
      setJoining(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setError(null);
    setValue('');
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
      <form
        onSubmit={e => {
          e.preventDefault();
          lookUp(value);
        }}
        className="space-y-1"
      >
        <label htmlFor="joinCode" className="block text-sm font-medium text-slate-700">Join a group</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="joinCode"
            type="text"
            value={value}
            onChange={e => {
              setValue(formatJoinInput(e.target.value));
              setPreview(null);
              setError(null);
            }}
            placeholder="ABCD-2345"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="joinCodeHelp"
            aria-invalid={error ? true : undefined}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-md min-h-[44px] font-mono tracking-widest"
          />
          <button
            type="submit"
            disabled={looking || joining || !value.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md min-h-[44px] hover:bg-blue-700 disabled:opacity-50"
          >
            {looking ? 'Looking...' : 'Find group'}
          </button>
        </div>
        <p id="joinCodeHelp" className="text-xs text-slate-500">
          The code from your teacher: 8 letters and digits. You can also paste the invite link.
        </p>
      </form>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {preview && <JoinCard preview={preview} joining={joining} onJoin={confirmJoin} onCancel={reset} />}
    </div>
  );
}
