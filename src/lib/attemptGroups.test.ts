import { describe, expect, it } from 'vitest';
import { LEGACY_PREFIX, attemptGroupLabels, groupFilterOptions, matchesGroupFilter } from './attemptGroups';

const names = new Map([['g1', 'Anatomy 3'], ['g2', 'Physiology']]);

describe('attemptGroupLabels', () => {
  it('names the real groups of an attempt', () => {
    expect(attemptGroupLabels({ groupIds: ['g1', 'g2'] }, names)).toEqual(['Anatomy 3', 'Physiology']);
  });

  it('marks a group that no longer exists instead of showing an id', () => {
    expect(attemptGroupLabels({ groupIds: ['gone'] }, names)).toEqual(['Deleted group']);
  });

  it('falls back to the profile text for older attempts', () => {
    expect(attemptGroupLabels({ studentGroup: 'Lech-312' }, names)).toEqual(['Lech-312']);
    expect(attemptGroupLabels({ groupIds: [], studentGroup: 'Lech-312' }, names)).toEqual(['Lech-312']);
  });

  it('is empty when there is nothing to show', () => {
    expect(attemptGroupLabels({}, names)).toEqual([]);
  });

  it('prefers real groups over the profile text', () => {
    expect(attemptGroupLabels({ groupIds: ['g1'], studentGroup: 'typed' }, names)).toEqual(['Anatomy 3']);
  });
});

describe('matchesGroupFilter', () => {
  const attempts = [
    { id: 'a', groupIds: ['g1'], studentGroup: 'typed-1' },
    { id: 'b', groupIds: ['g1', 'g2'] },
    { id: 'c', groupIds: ['g2'] },
    { id: 'd', studentGroup: 'Lech-312' },
    { id: 'e', groupIds: [], studentGroup: 'Lech-312' },
    { id: 'f' },
  ];
  const ids = (filter: string) => attempts.filter(a => matchesGroupFilter(a, filter)).map(a => a.id);

  it('no filter shows everything', () => {
    expect(ids('')).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('a group shows everyone who took an exam for it', () => {
    expect(ids('g1')).toEqual(['a', 'b']);
    expect(ids('g2')).toEqual(['b', 'c']);
    expect(ids('nope')).toEqual([]);
  });

  it('profile text only matches attempts that have no real groups', () => {
    expect(ids(`${LEGACY_PREFIX}Lech-312`)).toEqual(['d', 'e']);
    expect(ids(`${LEGACY_PREFIX}typed-1`)).toEqual([]);
  });
});

describe('groupFilterOptions', () => {
  const groups = [{ id: 'g2', name: 'Physiology' }, { id: 'g1', name: 'Anatomy 3' }, { id: 'g9', name: 'Empty' }];
  const attempts = [
    { groupIds: ['g1'] },
    { groupIds: ['g1', 'g2'] },
    { groupIds: ['deadbeef'] },
    { studentGroup: 'Lech-312' },
    { studentGroup: 'Lech-312' },
    { studentGroup: 'Ped-101' },
    {},
  ];
  const options = groupFilterOptions(attempts, groups);

  it('lists the visible groups by name with their attempt counts, groups without attempts included', () => {
    expect(options.groups.map(o => [o.label, o.count])).toEqual([
      ['Anatomy 3', 2],
      ['Deleted group (dead)', 1],
      ['Empty', 0],
      ['Physiology', 1],
    ]);
  });

  it('keeps older attempts reachable through their profile text', () => {
    expect(options.legacy).toEqual([
      { value: `${LEGACY_PREFIX}Lech-312`, label: 'Lech-312', count: 2 },
      { value: `${LEGACY_PREFIX}Ped-101`, label: 'Ped-101', count: 1 },
    ]);
  });

  it('every option selects exactly as many attempts as it counts', () => {
    for (const option of [...options.groups, ...options.legacy]) {
      expect(attempts.filter(a => matchesGroupFilter(a, option.value))).toHaveLength(option.count);
    }
  });
});
