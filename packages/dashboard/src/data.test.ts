import { describe, expect, it } from 'vitest';

import { parseSnapshotText } from './data';

describe('parseSnapshotText', () => {
  it('treats empty and placeholder text as missing', () => {
    expect(parseSnapshotText('')).toEqual({ status: 'missing' });
    expect(parseSnapshotText(' __MIGRATION_TRACKER_DATA__ ')).toEqual({ status: 'missing' });
  });

  it('rejects other schema versions', () => {
    expect(parseSnapshotText('{"schemaVersion":3}')).toMatchObject({ status: 'invalid' });
  });

  it('fills defaults for optional arrays', () => {
    const state = parseSnapshotText(
      '{"schemaVersion":1,"generatedAt":"2026-10-01T00:00:00Z","groups":[{"id":"a","mode":"report","sites":2}]}',
    );
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.snapshot.sites).toEqual([]);
    expect(state.snapshot.history).toEqual([]);
    expect(state.snapshot.totalSites).toBe(2);
    expect(state.snapshot.groups[0]?.byPackage).toEqual({});
  });
});

describe('parseSnapshotText schema versions', () => {
  it('accepts v2 snapshots as-is and fills kinds for v1 sites', () => {
    const site = { id: 'a|f.ts|import|x|0', groupId: 'a', filePath: 'f.ts', importKind: 'import', line: 1 };
    const v1 = parseSnapshotText(JSON.stringify({ schemaVersion: 1, generatedAt: '2026-10-01T00:00:00Z', groups: [], sites: [site] }));
    expect(v1.status === 'ready' && v1.snapshot.sites[0]?.kinds).toEqual(['import']);
    const v2Site = { ...site, id: 'a|f.ts|import|x', kinds: ['dynamic-import', 'import'] };
    const v2 = parseSnapshotText(JSON.stringify({ schemaVersion: 2, generatedAt: '2026-10-01T00:00:00Z', groups: [], sites: [v2Site] }));
    expect(v2.status === 'ready' && v2.snapshot.sites[0]?.kinds).toEqual(['dynamic-import', 'import']);
  });
});

describe('normalizeSnapshot v1 upgrade', () => {
  const v1Site = (importKind: string, occurrence: number) => ({
    id: `a|f.ts|${importKind}|x|${occurrence}`,
    groupId: 'a',
    filePath: 'f.ts',
    packageName: 'x',
    moduleSpecifier: 'x',
    importKind,
    typeOnly: false,
    sourceFingerprint: 'abc',
    occurrence,
    line: 3,
    column: 1,
  });

  it('maps syntactic kinds to module-system kinds and drops occurrence', () => {
    const state = parseSnapshotText(
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-10-01T00:00:00Z',
        groups: [],
        sites: ['import', 'export-from', 'dynamic-import', 'require', 'import-equals'].map((k, i) => v1Site(k, i)),
        history: [{ generatedAt: '2026-09-01T00:00:00Z', totals: { a: 5 } }],
      }),
    );
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.snapshot.schemaVersion).toBe(2);
    expect(state.snapshot.upgradedFrom).toBe(1);
    expect(state.snapshot.sites.map((s) => [s.importKind, s.kinds])).toEqual([
      ['import', ['import']],
      ['import', ['export-from']],
      ['import', ['dynamic-import']],
      ['require', ['require']],
      ['require', ['import-equals']],
    ]);
    for (const site of state.snapshot.sites) expect(site).not.toHaveProperty('occurrence');
    expect(state.snapshot.sites[0]?.line).toBe(3);
  });

  it('does not mark v2 snapshots as upgraded', () => {
    const state = parseSnapshotText(JSON.stringify({ schemaVersion: 2, generatedAt: '2026-10-01T00:00:00Z', groups: [] }));
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && 'upgradedFrom' in state.snapshot).toBe(false);
  });
});


describe('normalizeSnapshot progress fields', () => {
  it('keeps valid progress fields and drops malformed ones', () => {
    const state = parseSnapshotText(
      JSON.stringify({
        schemaVersion: 2,
        generatedAt: '2026-10-01T00:00:00Z',
        totalSites: 2,
        groups: [
          {
            id: 'a',
            mode: 'report',
            sites: 2,
            start: 4,
            completePct: 'nope',
            adoptionPct: null,
            byOwner: { '@x': 2, '@y': 'bad' },
            byDirectory: 'bad',
            startHere: [{ filePath: 'a.ts', count: 1 }, { filePath: 3 }],
            forecast: { status: 'on-track' },
          },
        ],
        sites: [{ id: 's', groupId: 'a', filePath: 'a.ts', importKind: 'import', owners: ['@x', 7] }],
        totals: { sites: 2, start: 4, completePct: 50, newSites: 'x', adoptionPct: null },
        sourceUrlTemplate: 'https://example.com/{path}',
      }),
    );
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    const group = state.snapshot.groups[0]!;
    expect(group.start).toBe(4);
    expect(group).not.toHaveProperty('completePct');
    expect(group.adoptionPct).toBeNull();
    expect(group.byOwner).toEqual({ '@x': 2 });
    expect(group).not.toHaveProperty('byDirectory');
    expect(group.startHere).toEqual([{ filePath: 'a.ts', count: 1 }]);
    expect(group).not.toHaveProperty('forecast');
    expect(state.snapshot.sites[0]?.owners).toEqual(['@x']);
    expect(state.snapshot.totals).toEqual({ sites: 2, start: 4, completePct: 50, adoptionPct: null });
    expect(state.snapshot.sourceUrlTemplate).toBe('https://example.com/{path}');
  });

  it('drops totals without a site count', () => {
    const state = parseSnapshotText(
      JSON.stringify({ schemaVersion: 2, generatedAt: '2026-10-01T00:00:00Z', groups: [], totals: { start: 3 } }),
    );
    expect(state.status === 'ready' && state.snapshot.totals).toBeUndefined();
  });
});
