import { describe, expect, it } from 'vitest';
import { assignOwners, buildReport, collectAdoption, collectSites, historyEntry, parseCodeowners } from './index.js';
import type { HistoryEntry, RawImport } from './index.js';
import { config, raw } from './__fixtures__/helpers.js';

const cfgInput = {
  version: 1,
  groups: {
    forms: {
      description: 'Form libraries',
      owner: '@forms',
      docs: 'https://example.com/forms',
      old: ['redux-form', '@company/legacy-forms'],
      new: ['react-hook-form'],
      enforcement: { mode: 'ratchet' },
    },
    dates: { old: ['moment'], new: ['date-fns'] },
    empty: { old: ['request'], enforcement: { mode: 'ban' } },
  },
};
const cfg = config(cfgInput);
const now = new Date('2026-03-15T12:00:00.000Z');

const rawImports: RawImport[] = [
  raw('src/b.ts', 'redux-form', 1),
  raw('src/b.ts', 'redux-form/immutable', 2),
  raw('src/a.ts', '@company/legacy-forms/x', 1),
  raw('src/a.ts', 'redux-form', 2),
  raw('src/c.ts', 'redux-form', 1),
  raw('src/z.ts', 'moment', 1),
];
const sites = collectSites(cfg, rawImports);

describe('buildReport', () => {
  it('builds groups in config order, including empty groups', () => {
    const report = buildReport(cfg, sites, { now });
    expect(report.schemaVersion).toBe(2);
    expect(report.generatedAt).toBe('2026-03-15T12:00:00.000Z');
    expect(report.totalSites).toBe(6);
    expect(report.sites).toEqual(sites);
    expect(report.history).toEqual([]);
    expect(report).not.toHaveProperty('revision');
    expect(report.groups.map((g) => g.id)).toEqual(['forms', 'dates', 'empty']);
    expect(report.groups[0]).toEqual({
      id: 'forms',
      description: 'Form libraries',
      owner: '@forms',
      docs: 'https://example.com/forms',
      mode: 'ratchet',
      old: ['redux-form', '@company/legacy-forms'],
      new: ['react-hook-form'],
      sites: 5,
      files: 3,
      byPackage: { 'redux-form': 4, '@company/legacy-forms': 1 },
      topFiles: [
        { filePath: 'src/a.ts', count: 2 },
        { filePath: 'src/b.ts', count: 2 },
        { filePath: 'src/c.ts', count: 1 },
      ],
      start: 5,
      completePct: 0,
      newSites: 0,
      adoptionPct: 0,
      byOwner: { '@forms': 5 },
      byDirectory: { src: 5 },
      startHere: [
        { filePath: 'src/c.ts', count: 1 },
        { filePath: 'src/a.ts', count: 2 },
        { filePath: 'src/b.ts', count: 2 },
      ],
    });
    expect(report.groups[2]).toEqual({
      id: 'empty',
      mode: 'ban',
      old: ['request'],
      new: [],
      sites: 0,
      files: 0,
      byPackage: {},
      topFiles: [],
      start: 0,
      completePct: 100,
      newSites: 0,
      adoptionPct: null,
      byOwner: {},
      byDirectory: {},
      startHere: [],
    });
  });

  it('limits topFiles', () => {
    expect(buildReport(cfg, sites, { now, topFiles: 1 }).groups[0]?.topFiles).toEqual([{ filePath: 'src/a.ts', count: 2 }]);
    expect(buildReport(cfg, sites, { now, topFiles: 0 }).groups[0]?.topFiles).toEqual([]);
  });

  it('defaults topFiles to 10', () => {
    const many = collectSites(
      cfg,
      Array.from({ length: 12 }, (_, i) => raw(`src/f${String(i).padStart(2, '0')}.ts`, 'moment', 1)),
    );
    const top = buildReport(cfg, many, { now }).groups[1]?.topFiles ?? [];
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({ filePath: 'src/f00.ts', count: 1 });
  });

  it('passes history and revision through', () => {
    const history: HistoryEntry[] = [{ generatedAt: '2026-01-01T00:00:00.000Z', totals: { forms: 9 } }];
    const report = buildReport(cfg, sites, { now, history, revision: { commit: 'abc' } });
    expect(report.history).toBe(history);
    expect(report.revision).toEqual({ commit: 'abc' });
  });
});

describe('historyEntry', () => {
  it('summarizes totals per group', () => {
    const report = buildReport(cfg, sites, { now, revision: { commit: 'abc', branch: 'main' } });
    expect(historyEntry(report)).toEqual({
      generatedAt: '2026-03-15T12:00:00.000Z',
      identityVersion: 2,
      revision: { commit: 'abc', branch: 'main' },
      totals: { forms: 5, dates: 1, empty: 0 },
      newTotals: { forms: 0, dates: 0, empty: 0 },
    });
    expect(historyEntry(buildReport(cfg, [], { now }))).toEqual({
      generatedAt: '2026-03-15T12:00:00.000Z',
      identityVersion: 2,
      totals: { forms: 0, dates: 0, empty: 0 },
      newTotals: { forms: 0, dates: 0, empty: 0 },
    });
  });
});

describe('buildReport progress', () => {
  const g = (report: ReturnType<typeof buildReport>, id: string) => report.groups.find((x) => x.id === id)!;

  it('start comes from config, then the earliest history entry with the group, then the current count', () => {
    const history: HistoryEntry[] = [
      { generatedAt: '2026-02-01T00:00:00.000Z', totals: { forms: 8, dates: 3 } },
      { generatedAt: '2026-01-01T00:00:00.000Z', totals: { forms: 10 } },
      { generatedAt: 'not a date', totals: { forms: 99, dates: 99 } },
    ];
    const withStart = config({ ...cfgInput, groups: { ...cfgInput.groups, dates: { old: ['moment'], start: 4 } } });
    const report = buildReport(withStart, sites, { now, history });
    expect(g(report, 'forms')).toMatchObject({ start: 10, sites: 5, completePct: 50 });
    expect(g(report, 'dates')).toMatchObject({ start: 4, sites: 1, completePct: 75 });
    expect(g(report, 'empty')).toMatchObject({ start: 0, completePct: 100 });
    const noHistory = buildReport(cfg, sites, { now });
    expect(g(noHistory, 'forms')).toMatchObject({ start: 5, completePct: 0 });
    expect(g(buildReport(cfg, sites, { now, history }), 'dates')).toMatchObject({ start: 3, completePct: 66.7 });
  });

  it('clamps start to at least the current count', () => {
    const low = config({ ...cfgInput, groups: { ...cfgInput.groups, forms: { ...cfgInput.groups.forms, start: 2 } } });
    expect(g(buildReport(low, sites, { now }), 'forms')).toMatchObject({ start: 5, completePct: 0 });
    const history: HistoryEntry[] = [{ generatedAt: '2026-01-01T00:00:00.000Z', totals: { forms: 1 } }];
    expect(g(buildReport(cfg, sites, { now, history }), 'forms')).toMatchObject({ start: 5, completePct: 0 });
  });

  it('a start of 0 with no sites is 100% complete', () => {
    const zero = config({ ...cfgInput, groups: { ...cfgInput.groups, empty: { old: ['request'], start: 0 } } });
    expect(g(buildReport(zero, sites, { now }), 'empty')).toMatchObject({ start: 0, completePct: 100 });
  });

  it('counts adoption per group and computes adoptionPct', () => {
    const adoption = collectAdoption(cfg, [
      raw('src/n1.ts', 'react-hook-form', 1),
      raw('src/n2.ts', 'react-hook-form/x', 1),
      raw('src/n2.ts', 'react-hook-form', 2),
      raw('src/n3.ts', 'date-fns', 1),
    ]);
    const report = buildReport(cfg, sites, {
      now,
      adoption: [...adoption, { groupId: 'gone', filePath: 'x.ts', packageName: 'y' }, adoption[0]!],
    });
    expect(g(report, 'forms')).toMatchObject({ newSites: 2, sites: 5, adoptionPct: 28.6 });
    expect(g(report, 'dates')).toMatchObject({ newSites: 1, sites: 1, adoptionPct: 50 });
    expect(g(report, 'empty')).toMatchObject({ newSites: 0, sites: 0, adoptionPct: null });
    expect(report.totals).toEqual({ sites: 6, start: 6, completePct: 0, newSites: 3, adoptionPct: 33.3 });
    expect(historyEntry(report).newTotals).toEqual({ forms: 2, dates: 1, empty: 0 });
  });

  it('excludes groups without replacements from adoption', () => {
    const noNew = config({
      ...cfgInput,
      groups: { ...cfgInput.groups, plain: { old: ['left-pad'] } },
    });
    const withPlain = collectSites(noNew, [...rawImports, raw('src/p.ts', 'left-pad', 1)]);
    const report = buildReport(noNew, withPlain, {
      now,
      adoption: collectAdoption(noNew, [raw('src/n1.ts', 'react-hook-form', 1)]),
    });
    expect(g(report, 'plain')).toMatchObject({ sites: 1, newSites: 0, adoptionPct: null });
    expect(report.totals).toMatchObject({ sites: 7, newSites: 1 });
    expect(report.totals?.adoptionPct).toBe(14.3);
  });

  it('totals sum group starts', () => {
    const history: HistoryEntry[] = [{ generatedAt: '2026-01-01T00:00:00.000Z', totals: { forms: 10, dates: 2 } }];
    expect(buildReport(cfg, sites, { now, history }).totals).toEqual({
      sites: 6,
      start: 12,
      completePct: 50,
      newSites: 0,
      adoptionPct: 0,
    });
    expect(buildReport(cfg, [], { now }).totals).toEqual({ sites: 0, start: 0, completePct: 100, newSites: 0, adoptionPct: null });
  });

  it('groups remaining sites by CODEOWNERS owner, falling back to the group owner or Unowned', () => {
    const rules = parseCodeowners('/src/a.ts @acme/web @acme/core\n/src/b.ts @acme/web\n/src/z.ts @acme/time');
    const owned = assignOwners(sites, rules);
    const report = buildReport(cfg, owned, { now });
    expect(report.sites.find((s) => s.filePath === 'src/b.ts')?.owners).toEqual(['@acme/web']);
    expect(g(report, 'forms').byOwner).toEqual({ '@acme/core': 2, '@acme/web': 4, '@forms': 1 });
    expect(g(report, 'dates').byOwner).toEqual({ '@acme/time': 1 });
    expect(g(buildReport(cfg, sites, { now }), 'dates').byOwner).toEqual({ Unowned: 1 });
  });

  it('groups remaining sites by the first two directory segments', () => {
    const many = collectSites(cfg, [
      raw('apps/web/a/b.ts', 'moment', 1),
      raw('apps/web/c.ts', 'moment', 1),
      raw('apps/api/c.ts', 'moment', 1),
      raw('src/x.ts', 'moment', 1),
      raw('index.ts', 'moment', 1),
    ]);
    expect(g(buildReport(cfg, many, { now }), 'dates').byDirectory).toEqual({
      '.': 1,
      src: 1,
      'apps/web': 2,
      'apps/api': 1,
    });
  });

  it('startHere lists up to 10 files with the fewest sites, ascending count then path', () => {
    const imports = [
      ...Array.from({ length: 11 }, (_, i) => raw(`src/f${String(i).padStart(2, '0')}.ts`, 'redux-form', 1)),
      raw('src/aa.ts', 'redux-form', 1),
      raw('src/aa.ts', 'redux-form/x', 2),
      raw('src/zz.ts', 'redux-form', 1),
    ];
    const report = buildReport(cfg, collectSites(cfg, imports), { now, topFiles: 1 });
    const startHere = g(report, 'forms').startHere;
    expect(startHere).toHaveLength(10);
    expect(startHere[0]).toEqual({ filePath: 'src/f00.ts', count: 1 });
    expect(startHere.at(-1)).toEqual({ filePath: 'src/f09.ts', count: 1 });
    expect(startHere.some((f) => f.filePath === 'src/aa.ts')).toBe(false);
    expect(g(report, 'forms').topFiles).toEqual([{ filePath: 'src/aa.ts', count: 2 }]);
  });

  it('stores the source url template only when given', () => {
    const template = 'https://example.com/acme/blob/{sha}/{path}#L{line}';
    expect(buildReport(cfg, sites, { now, sourceUrlTemplate: template }).sourceUrlTemplate).toBe(template);
    expect(buildReport(cfg, sites, { now })).not.toHaveProperty('sourceUrlTemplate');
    expect(buildReport(cfg, sites, { now, sourceUrlTemplate: '' })).not.toHaveProperty('sourceUrlTemplate');
  });
});
