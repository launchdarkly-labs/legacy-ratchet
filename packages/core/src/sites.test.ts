import { describe, expect, it } from 'vitest';
import { collectSites, enrichSites, evaluate, fingerprint } from './index.js';
import type { RawImport } from './index.js';
import { config, raw } from './__fixtures__/helpers.js';

const cfg = config({
  version: 1,
  groups: {
    forms: { old: ['redux-form'], new: ['react-hook-form'] },
    dates: { old: ['moment'], enforcement: { mode: 'ratchet' } },
  },
});

function unlocated(filePath: string, moduleSpecifier: string, extra: Partial<RawImport> = {}): RawImport {
  return { filePath, moduleSpecifier, importKind: 'import', typeOnly: false, ...extra };
}

describe('collectSites', () => {
  it('drops unmatched imports and builds full sites', () => {
    const sites = collectSites(cfg, [
      raw('./src/a.ts', 'react', 1),
      raw('./src/a.ts', 'redux-form/immutable', 2, { column: 20, typeOnly: true }),
      raw('src/a.ts', './redux-form', 3),
    ]);
    expect(sites).toEqual([
      {
        id: 'forms|src/a.ts|import|redux-form/immutable',
        groupId: 'forms',
        filePath: 'src/a.ts',
        packageName: 'redux-form',
        moduleSpecifier: 'redux-form/immutable',
        importKind: 'import',
        kinds: ['import'],
        typeOnly: true,
        sourceFingerprint: fingerprint('import', 'redux-form/immutable'),
        occurrences: 1,
        line: 2,
        column: 20,
      },
    ]);
  });

  it('sorts by id', () => {
    const sites = collectSites(cfg, [
      raw('src/b.ts', 'moment', 1),
      raw('src/a.ts', 'moment', 5, { column: 9 }),
      raw('src/a.ts', 'redux-form', 5, { column: 3 }),
      raw('src/a.ts', 'moment/locale/fr', 2),
    ]);
    expect(sites.map((s) => s.id)).toEqual([
      'dates|src/a.ts|import|moment',
      'dates|src/a.ts|import|moment/locale/fr',
      'dates|src/b.ts|import|moment',
      'forms|src/a.ts|import|redux-form',
    ]);
  });

  it('merges occurrences per (file, group, module-system kind, specifier)', () => {
    const sites = collectSites(cfg, [
      raw('src/a.ts', 'moment', 30),
      raw('src/a.ts', 'moment', 10),
      raw('src/a.ts', 'moment', 20, { importKind: 'require' }),
      raw('src/a.ts', 'moment/locale/fr', 25),
      raw('src/b.ts', 'moment', 1),
      raw('src/a.ts', 'moment', 10, { column: 40, importKind: 'dynamic-import' }),
    ]);
    expect(sites.map((s) => [s.id, s.kinds, s.occurrences, s.line, s.column])).toEqual([
      ['dates|src/a.ts|import|moment', ['dynamic-import', 'import'], 3, 10, 1],
      ['dates|src/a.ts|import|moment/locale/fr', ['import'], 1, 25, 1],
      ['dates|src/a.ts|require|moment', ['require'], 1, 20, 1],
      ['dates|src/b.ts|import|moment', ['import'], 1, 1, 1],
    ]);
  });

  it('merges import-equals with require and export-from with import', () => {
    const sites = collectSites(cfg, [
      raw('src/a.ts', 'moment', 1, { importKind: 'import-equals' }),
      raw('src/a.ts', 'moment', 2, { importKind: 'require' }),
      raw('src/a.ts', 'redux-form', 3, { importKind: 'export-from' }),
      raw('src/a.ts', 'redux-form', 4),
    ]);
    expect(sites.map((s) => [s.id, s.kinds, s.sourceFingerprint])).toEqual([
      ['dates|src/a.ts|require|moment', ['import-equals', 'require'], fingerprint('require', 'moment')],
      ['forms|src/a.ts|import|redux-form', ['export-from', 'import'], fingerprint('import', 'redux-form')],
    ]);
  });

  it('is type-only only when every merged occurrence is type-only', () => {
    const mixed = collectSites(cfg, [raw('src/a.ts', 'moment', 1, { typeOnly: true }), raw('src/a.ts', 'moment', 2)]);
    expect(mixed.map((s) => s.typeOnly)).toEqual([false]);
    const allTypes = collectSites(cfg, [raw('src/a.ts', 'moment', 1, { typeOnly: true }), raw('src/a.ts', 'moment', 2, { typeOnly: true })]);
    expect(allTypes.map((s) => s.typeOnly)).toEqual([true]);
  });

  it('keeps ids stable when line numbers shift or duplicates are added', () => {
    const before = collectSites(cfg, [raw('src/a.ts', 'moment', 3), raw('src/a.ts', 'redux-form', 4)]);
    const after = collectSites(cfg, [
      raw('src/a.ts', 'moment', 13),
      raw('src/a.ts', 'redux-form', 14),
      raw('src/a.ts', 'moment', 40, { importKind: 'dynamic-import' }),
    ]);
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(after.map((s) => s.line)).not.toEqual(before.map((s) => s.line));
  });

  describe('suppression', () => {
    const reasoned = { groupIds: ['dates'], reason: 'legacy widget' };
    const all = { groupIds: [], reason: 'whole file is legacy' };

    it('is suppressed when every occurrence is suppressed (first occurrence wins)', () => {
      const sites = collectSites(cfg, [raw('src/a.ts', 'moment', 9, { suppression: all }), raw('src/a.ts', 'moment', 1, { suppression: reasoned })]);
      expect(sites[0]?.suppression).toEqual(reasoned);
      expect(sites[0]?.suppression).not.toBe(reasoned);
      expect(evaluate(cfg, sites, undefined).suppressed).toHaveLength(1);
    });

    it('is not suppressed when only some occurrences are', () => {
      const sites = collectSites(cfg, [raw('src/a.ts', 'moment', 1, { suppression: reasoned }), raw('src/a.ts', 'moment', 2)]);
      expect(sites[0]).not.toHaveProperty('suppression');
      expect(sites[0]?.line).toBe(2);
      expect(evaluate(cfg, sites, undefined).violations).toHaveLength(1);
    });

    it('does not count a suppression for another group', () => {
      const sites = collectSites(cfg, [raw('src/a.ts', 'moment', 1, { suppression: { groupIds: ['forms'], reason: 'x' } })]);
      expect(sites[0]).not.toHaveProperty('suppression');
    });

    it('attaches an empty-reason suppression so callers can warn about it', () => {
      const empty = { groupIds: [], reason: '' };
      const sites = collectSites(cfg, [raw('src/a.ts', 'moment', 1, { suppression: reasoned }), raw('src/a.ts', 'moment', 2, { suppression: empty })]);
      expect(sites[0]?.suppression).toEqual(empty);
      expect(evaluate(cfg, sites, undefined).suppressed).toEqual([]);
      const alone = collectSites(cfg, [raw('src/a.ts', 'moment', 1, { suppression: empty })]);
      expect(alone[0]?.suppression).toEqual(empty);
    });

    it('omits suppression when no occurrence has one', () => {
      expect(collectSites(cfg, [raw('src/a.ts', 'moment', 1)])[0]).not.toHaveProperty('suppression');
    });
  });

  describe('position', () => {
    it('uses the first unsuppressed occurrence', () => {
      const sites = collectSites(cfg, [
        raw('src/a.ts', 'moment', 1, { suppression: { groupIds: [], reason: 'ok' } }),
        raw('src/a.ts', 'moment', 7, { column: 3 }),
        raw('src/a.ts', 'moment', 9),
      ]);
      expect([sites[0]?.line, sites[0]?.column]).toEqual([7, 3]);
    });

    it('falls back to the first occurrence when all are suppressed', () => {
      const s = { groupIds: [], reason: 'ok' };
      const sites = collectSites(cfg, [raw('src/a.ts', 'moment', 8, { suppression: s }), raw('src/a.ts', 'moment', 4, { column: 5, suppression: s })]);
      expect([sites[0]?.line, sites[0]?.column]).toEqual([4, 5]);
    });

    it('orders by column within a line', () => {
      const sites = collectSites(cfg, [raw('src/a.ts', 'moment', 2, { column: 30 }), raw('src/a.ts', 'moment', 2, { column: 4 })]);
      expect(sites[0]?.column).toBe(4);
    });
  });

  describe('unlocated input', () => {
    it('omits line, column and occurrences when no position is known', () => {
      const sites = collectSites(cfg, [unlocated('src/a.ts', 'moment'), unlocated('src/a.ts', 'moment', { importKind: 'export-from' })]);
      expect(sites).toEqual([
        {
          id: 'dates|src/a.ts|import|moment',
          groupId: 'dates',
          filePath: 'src/a.ts',
          packageName: 'moment',
          moduleSpecifier: 'moment',
          importKind: 'import',
          kinds: ['export-from', 'import'],
          typeOnly: false,
          sourceFingerprint: fingerprint('import', 'moment'),
        },
      ]);
    });

    it('uses a located occurrence but omits occurrences when some are unlocated', () => {
      const sites = collectSites(cfg, [unlocated('src/a.ts', 'moment'), raw('src/a.ts', 'moment', 6)]);
      expect(sites[0]?.line).toBe(6);
      expect(sites[0]).not.toHaveProperty('occurrences');
    });
  });

  it('returns [] for no input', () => {
    expect(collectSites(cfg, [])).toEqual([]);
  });
});

describe('enrichSites', () => {
  it('copies position, suppression, kinds and typeOnly; ids always come from base', () => {
    const base = collectSites(cfg, [unlocated('src/a.ts', 'moment'), unlocated('src/a.ts', 'redux-form'), unlocated('src/b.ts', 'moment')]);
    const ok = { groupIds: [], reason: 'ok' };
    const located = collectSites(cfg, [
      raw('src/a.ts', 'moment', 3, { column: 8, typeOnly: true, suppression: ok }),
      raw('src/a.ts', 'moment', 5, { importKind: 'dynamic-import', typeOnly: true, suppression: ok }),
      raw('src/a.ts', 'redux-form', 1),
      raw('src/c.ts', 'moment', 1),
    ]);
    const { sites, unlocated: missing, extra } = enrichSites(base, located);
    expect(sites.map((s) => s.id)).toEqual(base.map((s) => s.id));
    expect(sites[0]).toMatchObject({
      id: 'dates|src/a.ts|import|moment',
      line: 3,
      column: 8,
      typeOnly: true,
      kinds: ['dynamic-import', 'import'],
      occurrences: 2,
      suppression: ok,
    });
    expect(sites[2]).toMatchObject({ id: 'forms|src/a.ts|import|redux-form', line: 1, occurrences: 1 });
    expect(sites[2]).not.toHaveProperty('suppression');
    expect(sites[1]).toBe(base[1]);
    expect(missing.map((s) => s.id)).toEqual(['dates|src/b.ts|import|moment']);
    expect(extra).toEqual(['dates|src/c.ts|import|moment']);
  });

  it('handles empty input', () => {
    expect(enrichSites([], [])).toEqual({ sites: [], unlocated: [], extra: [] });
  });
});
