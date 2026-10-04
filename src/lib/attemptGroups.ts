import type { Attempt } from '@/types';

type AttemptGroups = Pick<Attempt, 'groupIds' | 'studentGroup'>;

/** Filter values for attempts made before groups existed: the text a student typed into their profile. */
export const LEGACY_PREFIX = 'legacy:';

export interface GroupFilterOption {
  value: string;
  label: string;
  count: number;
}

/**
 * The groups an attempt belongs to, by name. Older attempts have no group ids, only the text the student typed
 * into the profile, so that text is shown instead.
 */
export function attemptGroupLabels(attempt: AttemptGroups, nameById: ReadonlyMap<string, string>): string[] {
  const ids = attempt.groupIds ?? [];
  if (ids.length > 0) return ids.map(id => nameById.get(id) ?? 'Deleted group');
  return attempt.studentGroup ? [attempt.studentGroup] : [];
}

/** The one rule behind both the list on screen and the CSV export, so they always show the same people. */
export function matchesGroupFilter(attempt: AttemptGroups, filter: string): boolean {
  if (!filter) return true;
  if (filter.startsWith(LEGACY_PREFIX)) {
    return (attempt.groupIds ?? []).length === 0 && attempt.studentGroup === filter.slice(LEGACY_PREFIX.length);
  }
  return (attempt.groupIds ?? []).includes(filter);
}

/**
 * Options for the group filter: the groups the viewer can see, plus ids found in attempts whose group is gone,
 * plus the profile text of older attempts. Each carries the number of attempts it would show.
 */
export function groupFilterOptions(
  attempts: AttemptGroups[],
  groups: { id: string; name: string }[],
): { groups: GroupFilterOption[]; legacy: GroupFilterOption[] } {
  const named = new Map(groups.map(g => [g.id, g.name]));
  const byId = new Map<string, number>();
  const legacy = new Map<string, number>();

  for (const attempt of attempts) {
    const ids = attempt.groupIds ?? [];
    if (ids.length > 0) {
      ids.forEach(id => byId.set(id, (byId.get(id) ?? 0) + 1));
    } else if (attempt.studentGroup) {
      legacy.set(attempt.studentGroup, (legacy.get(attempt.studentGroup) ?? 0) + 1);
    }
  }

  const real: GroupFilterOption[] = groups.map(g => ({ value: g.id, label: g.name, count: byId.get(g.id) ?? 0 }));
  for (const [id, count] of Array.from(byId.entries())) {
    if (!named.has(id)) real.push({ value: id, label: `Deleted group (${id.slice(0, 4)})`, count });
  }

  return {
    groups: real.sort((a, b) => a.label.localeCompare(b.label)),
    legacy: Array.from(legacy.entries())
      .map(([text, count]) => ({ value: `${LEGACY_PREFIX}${text}`, label: text, count }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
