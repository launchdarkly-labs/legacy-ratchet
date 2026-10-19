import { describe, expect, it } from 'vitest';

import type { DashboardGroup, SeriesSnapshot } from './model';
import { formatPct, progressFrom, progressOf, safeHref, sortGroupsForOverview, sourceUrl, totalsOf } from './progress';

const group = (overrides: Partial<DashboardGroup> = {}): DashboardGroup => ({
  id: 'g',
  mode: 'report',
  old: ['x'],
  new: ['y'],
  sites: 4,
  files: 2,
  byPackage: { x: 4 },
  topFiles: [],
  ...overrides,
});

describe('progressFrom', () => {
  it('prefers adoption, then removal when the count shrank', () => {
    expect(progressFrom(4, 60, 10, 5)).toEqual({ pct: 60, basis: 'adoption' });
    expect(progressFrom(4, null, 20, 5)).toEqual({ pct: 20, basis: 'complete' });
    expect(progressFrom(5, null, 0, 5)).toBeNull();
    expect(progressFrom(5, null, null, null)).toBeNull();
  });
});

describe('progressOf', () => {
  it('ignores adoption for groups without replacements', () => {
    const p = progressOf(group({ new: [], adoptionPct: 0, start: 8, completePct: 50 }), []);
    expect(p.progress).toEqual({ pct: 50, basis: 'complete' });
  });

  it('derives breakdowns from sites when the snapshot has none', () => {
    const site = (filePath: string, owners?: string[]) => ({
      id: filePath,
      groupId: 'g',
      filePath,
      packageName: 'x',
      moduleSpecifier: 'x',
      importKind: 'import' as const,
      kinds: ['import' as const],
      typeOnly: false,
      sourceFingerprint: 'f',
      ...(owners ? { owners } : {}),
    });
    const p = progressOf(group({ owner: '@team' }), [
      site('a/b/c.ts', ['@x']),
      site('a/b/d.ts'),
      site('a/b/d.ts'),
      site('root.ts'),
    ]);
    expect(p.byOwner).toEqual({ '@x': 1, '@team': 3 });
    expect(p.byDirectory).toEqual({ 'a/b': 3, '.': 1 });
    expect(p.startHere).toEqual([
      { filePath: 'a/b/c.ts', count: 1 },
      { filePath: 'root.ts', count: 1 },
      { filePath: 'a/b/d.ts', count: 2 },
    ]);
    expect(p.progress).toBeNull();
  });

  it('uses only the group owner when there is no site detail', () => {
    expect(progressOf(group(), []).byOwner).toEqual({ Unowned: 4 });
  });
});

describe('sortGroupsForOverview', () => {
  it('orders by progress ascending with done groups last', () => {
    const rows = [
      group({ id: 'done', sites: 0, adoptionPct: 100 }),
      group({ id: 'high', adoptionPct: 90 }),
      group({ id: 'none' }),
      group({ id: 'low', adoptionPct: 10 }),
    ].map((g) => ({ group: g, progress: progressOf(g, []) }));
    expect(sortGroupsForOverview(rows).map((r) => r.group.id)).toEqual(['none', 'low', 'high', 'done']);
  });
});

describe('totalsOf', () => {
  const snapshot = (overrides: Partial<SeriesSnapshot>): SeriesSnapshot => ({
    schemaVersion: 2,
    generatedAt: '2026-10-01T00:00:00Z',
    totalSites: 4,
    groups: [group()],
    sites: [],
    history: [],
    ...overrides,
  });

  it('uses snapshot totals when present', () => {
    const t = totalsOf(snapshot({ totals: { sites: 4, start: 8, completePct: 50, newSites: 12, adoptionPct: 75 } }));
    expect(t.progress).toEqual({ pct: 75, basis: 'adoption' });
  });

  it('computes what it can from groups for older snapshots', () => {
    expect(totalsOf(snapshot({})).progress).toBeNull();
    const t = totalsOf(snapshot({ groups: [group({ start: 8, newSites: 4 })] }));
    expect(t.completePct).toBe(50);
    expect(t.adoptionPct).toBe(50);
    expect(t.progress).toEqual({ pct: 50, basis: 'adoption' });
  });
});

describe('formatting and links', () => {
  it('formats percentages with one decimal at most', () => {
    expect(formatPct(62)).toBe('62%');
    expect(formatPct(62.46)).toBe('62.5%');
    expect(formatPct(99.96)).toBe('100%');
  });

  it('fills the source template and drops the line anchor without a line', () => {
    const template = 'https://example.com/acme/app/blob/{sha}/{path}#L{line}';
    expect(sourceUrl(template, { commit: 'abc' }, 'src/a b.ts', 7)).toBe(
      'https://example.com/acme/app/blob/abc/src/a%20b.ts#L7',
    );
    expect(sourceUrl(template, undefined, 'src/a.ts')).toBe('https://example.com/acme/app/blob/HEAD/src/a.ts');
    expect(sourceUrl(undefined, undefined, 'src/a.ts', 1)).toBeUndefined();
    expect(sourceUrl('javascript:alert(1)//{path}', undefined, 'a.ts', 1)).toBeUndefined();
  });

  it('allows only http links', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
