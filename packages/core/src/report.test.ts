import { describe, expect, it } from 'vitest';
import { buildReport, collectSites, historyEntry } from './index.js';
import type { HistoryEntry, RawImport } from './index.js';
import { config, raw } from './__fixtures__/helpers.js';

const cfg = config({
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
});
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
    });
    expect(historyEntry(buildReport(cfg, [], { now }))).toEqual({
      generatedAt: '2026-03-15T12:00:00.000Z',
      identityVersion: 2,
      totals: { forms: 0, dates: 0, empty: 0 },
    });
  });
});
