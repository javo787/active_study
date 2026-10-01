'use client';

import Link from 'next/link';
import { Group } from '@/types';

export type Audience = 'groups' | 'link';

interface Props {
  groups: Group[];
  loading?: boolean;
  audience: Audience;
  selected: string[];
  onChange: (audience: Audience, selected: string[]) => void;
}

/** "Who can take this exam": chosen groups (listed on their dashboards) or anyone with the link. */
export default function AudiencePicker({ groups, loading, audience, selected, onChange }: Props) {
  const toggle = (id: string) =>
    onChange('groups', selected.includes(id) ? selected.filter(g => g !== id) : [...selected, id]);

  return (
    <fieldset className="space-y-2">
      <legend className="block text-sm font-medium text-slate-700 mb-1">Who can take this exam</legend>

      <label className="flex items-center space-x-3 cursor-pointer min-h-[44px]">
        <input
          type="radio"
          name="audience"
          checked={audience === 'groups'}
          onChange={() => onChange('groups', selected)}
          className="w-5 h-5 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">Students in my groups (shown on their dashboard)</span>
      </label>

      {audience === 'groups' && (
        <div className="ml-8 space-y-1">
          {loading ? (
            <p className="text-sm text-slate-400">Loading groups...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-slate-500">
              You have no groups yet.{' '}
              <Link href="/dashboard/teacher/groups" className="text-blue-600 underline">Create one</Link>
              {' '}or choose link-only below.
            </p>
          ) : (
            groups.map(group => (
              <label key={group.id} className="flex items-center space-x-3 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={selected.includes(group.id)}
                  onChange={() => toggle(group.id)}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">{group.name}</span>
              </label>
            ))
          )}
        </div>
      )}

      <label className="flex items-center space-x-3 cursor-pointer min-h-[44px]">
        <input
          type="radio"
          name="audience"
          checked={audience === 'link'}
          onChange={() => onChange('link', [])}
          className="w-5 h-5 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">Anyone with the link (not listed anywhere)</span>
      </label>
    </fieldset>
  );
}
