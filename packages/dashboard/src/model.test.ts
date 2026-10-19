import type { ReportSnapshot } from '@legacy-ratchet/core';
import { describe, expect, it } from 'vitest';

import {
  aggregateOwners,
  buildSeries,
  deltaFor,
  filterSites,
  formatRevision,
  identityChangeAt,
  seriesFor,
  TOTAL_KEY,
} from './model';
import { sampleSnapshot } from './sample-data';

const base: ReportSnapshot = {
  schemaVersion: 2,
  generatedAt: '2026-10-10T00:00:00.000Z',
  totalSites: 5,
  groups: [
    { id: 'a', mode: 'report', old: ['x'], new: [], sites: 3, files: 2, byPackage: { x: 3 }, topFiles: [] },
    { id: 'b', owner: 'team', mode: 'ban', old: ['y'], new: [], sites: 2, files: 1, byPackage: { y: 2 }, topFiles: [] },
  ],
  sites: [],
  history: [],
};

describe('buildSeries', () => {
  it('uses only the current snapshot without history', () => {
    const points = buildSeries(base);
    expect(points).toHaveLength(1);
    expect(deltaFor(points, TOTAL_KEY)).toBeUndefined();
  });

  it('appends the current snapshot after history and compares with the last entry', () => {
    const points = buildSeries({
      ...base,
      history: [
        { generatedAt: '2026-10-03T00:00:00.000Z', totals: { a: 4, b: 2 } },
        { generatedAt: '2026-09-26T00:00:00.000Z', totals: { a: 6 } },
      ],
    });
    expect(points.map((p) => p.total)).toEqual([6, 6, 5]);
    expect(deltaFor(points, 'a')).toBe(-1);
    expect(seriesFor(points, 'b').map((v) => v.value)).toEqual([2, 2]);
  });

  it('replaces the last history entry when it is the current snapshot', () => {
    const points = buildSeries({
      ...base,
      history: [
        { generatedAt: '2026-10-03T00:00:00.000Z', totals: { a: 4, b: 3 } },
        { generatedAt: '2026-10-10T00:00:00.000Z', totals: { a: 3, b: 2 } },
      ],
    });
    expect(points).toHaveLength(2);
    expect(points[1]?.current).toBe(true);
    expect(deltaFor(points, TOTAL_KEY)).toBe(-2);
  });
});

describe('aggregateOwners', () => {
  it('groups by owner and puts Unowned last', () => {
    const rows = aggregateOwners(sampleSnapshot, buildSeries(sampleSnapshot));
    expect(rows.map((r) => r.owner)).toEqual(['@acme/web-platform', '@acme/frontend-infra', 'Unowned']);
    expect(rows.reduce((sum, r) => sum + r.sites, 0)).toBe(sampleSnapshot.totalSites);
  });
});

describe('filterSites', () => {
  it('matches text against path and specifier case-insensitively', () => {
    const hits = filterSites(sampleSnapshot.sites, { text: 'LIB/FIELD', packageName: '', importKind: '' });
    expect(hits.map((s) => s.moduleSpecifier)).toEqual(['redux-form/lib/Field']);
  });
});

describe('formatRevision', () => {
  it('shortens commits and handles missing parts', () => {
    expect(formatRevision({ commit: 'abcdef1234', branch: 'main' })).toBe('abcdef1 on main');
    expect(formatRevision({ branch: 'feature' })).toBe('feature');
    expect(formatRevision({})).toBeUndefined();
    expect(formatRevision(undefined)).toBeUndefined();
  });
});

describe('identityChangeAt', () => {
  const old = (day: string) => ({ generatedAt: `2026-09-${day}T00:00:00.000Z`, totals: { a: 9 } });
  const v2 = (day: string) => ({ ...old(day), identityVersion: 2 as const });

  it('returns the first v2 point that follows a pre-v2 point', () => {
    const points = buildSeries({ ...base, history: [old('01'), old('08'), v2('15'), v2('22')] });
    expect(identityChangeAt(points)).toBe('2026-09-15T00:00:00.000Z');
  });

  it('marks the current v2 report when all history predates it', () => {
    const points = buildSeries({ ...base, history: [old('01'), old('08')] });
    expect(identityChangeAt(points)).toBe(base.generatedAt);
  });

  it('returns nothing without a transition', () => {
    expect(identityChangeAt(buildSeries(base))).toBeUndefined();
    expect(identityChangeAt(buildSeries({ ...base, history: [v2('01'), v2('08')] }))).toBeUndefined();
    expect(identityChangeAt(buildSeries({ ...base, upgradedFrom: 1, history: [old('01'), old('08')] }))).toBeUndefined();
  });
});

describe('filterSites by kind', () => {
  it('filters on the module-system kind', () => {
    const hits = filterSites(sampleSnapshot.sites, { text: '', packageName: '', importKind: 'require' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((s) => s.importKind === 'require')).toBe(true);
  });
});

