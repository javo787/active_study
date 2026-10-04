'use client';

import { Exam, Group } from '@/types';

interface MyGroupsProps {
  groups: Group[];
  exams: Exam[];
  /** The group whose exams are shown below, or null for all. */
  activeGroupId: string | null;
  onFilter: (groupId: string | null) => void;
  onLeave: (group: Group) => void;
}

export function MyGroups({ groups, exams, activeGroupId, onFilter, onLeave }: MyGroupsProps) {
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="my-groups-title" className="space-y-3">
      <h2 id="my-groups-title" className="text-xl font-bold text-slate-800">My groups</h2>
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(group => {
          const count = exams.filter(e => e.groupIds?.includes(group.id)).length;
          const active = activeGroupId === group.id;
          return (
            <li key={group.id} className={`bg-white p-4 rounded-lg shadow-sm border flex flex-col gap-3 ${active ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'}`}>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-800 flex flex-wrap items-center gap-2">
                  <span className="truncate">{group.name}</span>
                  {group.archived && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Archived</span>}
                </h3>
                {group.ownerName && <p className="text-sm text-slate-600">Teacher: {group.ownerName}</p>}
                {group.description && <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{group.description}</p>}
              </div>
              <div className="flex items-center justify-between gap-2 mt-auto">
                <button
                  type="button"
                  onClick={() => onFilter(active ? null : group.id)}
                  aria-pressed={active}
                  disabled={count === 0}
                  className={`px-3 py-2 rounded-md text-sm min-h-[44px] disabled:opacity-60 ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {count === 0 ? 'No exams yet' : `${count} exam${count === 1 ? '' : 's'}`}
                </button>
                <button
                  type="button"
                  onClick={() => onLeave(group)}
                  aria-label={`Leave ${group.name}`}
                  className="px-3 py-2 rounded-md text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 min-h-[44px]"
                >
                  Leave
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
