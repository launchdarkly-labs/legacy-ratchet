import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  collectSites,
  configDigest,
  createBaseline,
  diffBaselines,
  parseBaseline,
  reconcileMigratedBaseline,
  serializeBaseline,
  updateBaseline,
} from './index.js';
import type { Baseline } from './index.js';
import { config, raw } from './__fixtures__/helpers.js';

const cfg = config({ version: 1, groups: { forms: { old: ['redux-form'], enforcement: { mode: 'ratchet' } }, dates: { old: ['moment'] } } });
const now = new Date('2026-03-15T12:00:00.000Z');
const meta = { config: cfg, scannerVersion: '0.1.0', now };

const sites = collectSites(cfg, [
  raw('src/b.ts', 'redux-form', 1),
  raw('src/a.ts', 'moment', 1),
  raw('src/a.ts', 'redux-form', 2),
  raw('src/a.ts', 'redux-form/lib/Field', 3),
]);

describe('createBaseline', () => {
  it('allows sorted unique ids of all sites', () => {
    const b = createBaseline([...sites, ...sites], meta);
    expect(b).toEqual({
      schemaVersion: 2,
      configDigest: configDigest(cfg),
      scannerVersion: '0.1.0',
      generatedAt: '2026-03-15T12:00:00.000Z',
      allowed: [
        'dates|src/a.ts|import|moment',
        'forms|src/a.ts|import|redux-form',
        'forms|src/a.ts|import|redux-form/lib/Field',
        'forms|src/b.ts|import|redux-form',
      ],
    });
    expect(b).not.toHaveProperty('revision');
  });

  it('records revision when given', () => {
    const b = createBaseline(sites, { ...meta, revision: { commit: 'abc', branch: 'main' } });
    expect(b.revision).toEqual({ commit: 'abc', branch: 'main' });
  });
});

describe('updateBaseline', () => {
  const previous = createBaseline(sites, { ...meta, scannerVersion: '0.0.1', now: new Date('2026-01-01T00:00:00Z') });

  it('only removes, never adds', () => {
    const current = collectSites(cfg, [
      raw('src/a.ts', 'redux-form', 2),
      raw('src/c.ts', 'redux-form', 1),
      raw('src/a.ts', 'moment', 9),
    ]);
    const { baseline, removed } = updateBaseline(previous, current, { ...meta, revision: { commit: 'def' } });
    expect(baseline.schemaVersion).toBe(2);
    expect(baseline.allowed).toEqual([
      'dates|src/a.ts|import|moment',
      'forms|src/a.ts|import|redux-form',
      'forms|src/a.ts|import|redux-form/lib/Field',
    ]);
    expect(baseline.allowed).not.toContain('forms|src/c.ts|import|redux-form');
    expect(removed).toEqual(['forms|src/b.ts|import|redux-form']);
    expect(baseline.scannerVersion).toBe('0.1.0');
    expect(baseline.generatedAt).toBe(now.toISOString());
    expect(baseline.revision).toEqual({ commit: 'def' });
    expect(baseline.configDigest).toBe(configDigest(cfg));
  });

  it('keeps an id while its file still has another site in the same group', () => {
    const current = collectSites(cfg, [raw('src/a.ts', 'redux-form/lib/Field', 3), raw('src/b.ts', 'redux-form', 1)]);
    const { baseline, removed } = updateBaseline(previous, current, meta);
    expect(baseline.allowed).toEqual([
      'forms|src/a.ts|import|redux-form',
      'forms|src/a.ts|import|redux-form/lib/Field',
      'forms|src/b.ts|import|redux-form',
    ]);
    expect(removed).toEqual(['dates|src/a.ts|import|moment']);
  });

  it('refreshes the digest when config changes', () => {
    const cfg2 = config({ version: 1, groups: { forms: { old: ['redux-form'], enforcement: { mode: 'ban' } }, dates: { old: ['moment'] } } });
    const { baseline } = updateBaseline(previous, sites, { ...meta, config: cfg2 });
    expect(baseline.configDigest).toBe(configDigest(cfg2));
    expect(baseline.allowed).toEqual(previous.allowed);
  });

  it('is a no-op on allowed when everything is still present', () => {
    const { baseline, removed } = updateBaseline(previous, sites, meta);
    expect(baseline.allowed).toEqual(previous.allowed);
    expect(removed).toEqual([]);
  });

  it('drops previous revision if none given', () => {
    const withRev = createBaseline(sites, { ...meta, revision: { commit: 'a' } });
    expect(updateBaseline(withRev, sites, meta).baseline).not.toHaveProperty('revision');
  });
});

describe('diffBaselines', () => {
  it('reports sorted added and removed ids', () => {
    const base = { ...createBaseline(sites, meta), allowed: ['c', 'a', 'b'] };
    const candidate = { ...base, allowed: ['d', 'b', 'a2', 'a'] };
    expect(diffBaselines(base, candidate)).toEqual({ added: ['a2', 'd'], removed: ['c'] });
    expect(diffBaselines(base, base)).toEqual({ added: [], removed: [] });
  });
});

describe('serializeBaseline / parseBaseline', () => {
  it('roundtrips', () => {
    const b = createBaseline(sites, { ...meta, revision: { commit: 'abc', branch: 'main' } });
    expect(parseBaseline(serializeBaseline(b))).toEqual(b);
  });

  it('serializes 2-space JSON with sorted allowed, stable key order and a trailing newline', () => {
    const b: Baseline = {
      allowed: ['b', 'a', 'b'],
      generatedAt: '2026-03-15T12:00:00.000Z',
      scannerVersion: '0.1.0',
      configDigest: 'sha256:x',
      schemaVersion: 2,
    };
    expect(serializeBaseline(b)).toBe(
      '{\n  "schemaVersion": 2,\n  "configDigest": "sha256:x",\n  "scannerVersion": "0.1.0",\n  "generatedAt": "2026-03-15T12:00:00.000Z",\n  "allowed": [\n    "a",\n    "b"\n  ]\n}\n',
    );
    expect(serializeBaseline({ ...b, revision: { commit: 'c' } })).toContain('"generatedAt": "2026-03-15T12:00:00.000Z",\n  "revision": {\n    "commit": "c"\n  },\n  "allowed"');
  });

  it('throws readable errors on invalid input', () => {
    expect(() => parseBaseline('nope')).toThrow(/^Invalid baseline: not valid JSON/);
    expect(() => parseBaseline('[]')).toThrow(/^Invalid baseline:/);
    const valid = JSON.parse(serializeBaseline(createBaseline(sites, meta))) as Record<string, unknown>;
    expect(() => parseBaseline(JSON.stringify({ ...valid, schemaVersion: 3 }))).toThrow(/schemaVersion/);
    expect(() => parseBaseline(JSON.stringify({ ...valid, allowed: 'x' }))).toThrow(/allowed/);
    expect(() => parseBaseline(JSON.stringify({ ...valid, allowed: [1] }))).toThrow(/allowed\.0/);
    const { configDigest: _d, ...noDigest } = valid;
    expect(() => parseBaseline(JSON.stringify(noDigest))).toThrow(/configDigest/);
    expect(() => parseBaseline(JSON.stringify({ ...valid, revision: 'main' }))).toThrow(/revision/);
  });
});

describe('schemaVersion 1 baselines', () => {
  const v1Text = readFileSync(new URL('./__fixtures__/baseline-v1.json', import.meta.url), 'utf8');

  it('upgrades the example v1 baseline in memory', () => {
    const b = parseBaseline(v1Text);
    expect(b.schemaVersion).toBe(2);
    expect(b.upgradedFrom).toBe(1);
    expect(b.revision).toEqual({ commit: 'd604dec2757f047cc0183b1693a67c34e02f11a0', branch: 'main' });
    expect(b.allowed).toEqual([
      'dates|src/components/DateLabel.tsx|import|moment',
      'dates|src/features/reports/ReportFilters.tsx|import|moment',
      'dates|src/features/reports/exportCsv.ts|import|moment',
      'dates|src/lib/dates.ts|import|moment',
      'forms|src/legacy/checkout/LegacyAddressForm.tsx|import|redux-form',
      'forms|src/legacy/checkout/LegacyAddressForm.tsx|import|redux-form/lib/Field',
      'forms|src/lib/forms.ts|import|redux-form',
      'http|scripts/fetch-fixtures.cjs|require|request',
      'http|src/api/uploads.ts|import|axios',
    ]);
  });

  it('dedupes occurrences and kinds that collapse, and drops malformed ids', () => {
    const b = parseBaseline(
      JSON.stringify({
        schemaVersion: 1,
        configDigest: 'sha256:x',
        scannerVersion: '0.1.0',
        generatedAt: '2026-03-15T12:00:00.000Z',
        allowed: [
          'forms|src/a.ts|import|redux-form|1',
          'forms|src/a.ts|import|redux-form|0',
          'forms|src/a.ts|dynamic-import|redux-form|0',
          'forms|src/a.ts|import-equals|redux-form|0',
          'forms|src/a.ts|import|redux-form',
          'garbage',
        ],
      }),
    );
    expect(b.allowed).toEqual(['forms|src/a.ts|import|redux-form', 'forms|src/a.ts|require|redux-form']);
  });

  it('serializes an upgraded baseline as v2 without upgradedFrom', () => {
    const b = parseBaseline(v1Text);
    const text = serializeBaseline(b);
    expect(text).toContain('"schemaVersion": 2');
    expect(text).not.toContain('upgradedFrom');
    const reparsed = parseBaseline(text);
    expect(reparsed).not.toHaveProperty('upgradedFrom');
    expect(reparsed.allowed).toEqual(b.allowed);
  });

  it('does not mark v2 baselines as upgraded', () => {
    expect(parseBaseline(serializeBaseline(createBaseline(sites, meta)))).not.toHaveProperty('upgradedFrom');
  });
});

describe('diffBaselines across the v1 → v2 migration', () => {
  const v1 = parseBaseline(
    JSON.stringify({
      schemaVersion: 1,
      configDigest: 'sha256:x',
      scannerVersion: '0.1.0',
      generatedAt: '2026-03-15T12:00:00.000Z',
      allowed: ['forms|src/a.ts|import-equals|redux-form|0', 'forms|src/b.ts|import|redux-form|0', 'forms|src/c.ts|import|redux-form|0'],
    }),
  );

  it('does not count a kind change for a known (group, file, specifier) as added', () => {
    const candidate = createBaseline([], meta);
    candidate.allowed = ['forms|src/a.ts|import|redux-form', 'forms|src/b.ts|import|redux-form', 'forms|src/d.ts|import|redux-form'];
    expect(diffBaselines(v1, candidate)).toEqual({
      added: ['forms|src/d.ts|import|redux-form'],
      removed: ['forms|src/a.ts|require|redux-form', 'forms|src/c.ts|import|redux-form'],
    });
  });

  it('is strict when the base was not upgraded', () => {
    const base = { ...v1 };
    delete base.upgradedFrom;
    const candidate = { ...v1, allowed: ['forms|src/a.ts|import|redux-form'] };
    delete candidate.upgradedFrom;
    expect(diffBaselines(base, candidate).added).toEqual(['forms|src/a.ts|import|redux-form']);
  });
});

describe('reconcileMigratedBaseline', () => {
  const v1 = parseBaseline(
    JSON.stringify({
      schemaVersion: 1,
      configDigest: 'sha256:old',
      scannerVersion: '0.1.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      allowed: [
        'forms|src/a.ts|import|redux-form|0',
        'forms|src/a.ts|import|redux-form|1',
        'dates|src/eq.ts|import|moment|0',
        'dates|src/gone.ts|import|moment|0',
        'forms|src/c.ts|dynamic-import|redux-form|0',
      ],
    }),
  );

  it('maps v1 ids, reconciles import-equals moving to require, and never adds new (file, specifier) pairs', () => {
    const current = collectSites(cfg, [
      raw('src/a.ts', 'redux-form', 1),
      raw('src/a.ts', 'redux-form', 2),
      raw('src/eq.ts', 'moment', 1, { importKind: 'import-equals' }),
      raw('src/c.ts', 'redux-form', 1, { importKind: 'dynamic-import' }),
      raw('src/new.ts', 'redux-form', 1),
      raw('src/a.ts', 'redux-form/lib/Field', 3),
    ]);
    const { baseline, added, dropped } = reconcileMigratedBaseline(v1, current, { ...meta, revision: { commit: 'abc' } });
    expect(baseline).toEqual({
      schemaVersion: 2,
      configDigest: configDigest(cfg),
      scannerVersion: '0.1.0',
      generatedAt: now.toISOString(),
      revision: { commit: 'abc' },
      allowed: ['dates|src/eq.ts|require|moment', 'forms|src/a.ts|import|redux-form', 'forms|src/c.ts|import|redux-form'],
    });
    expect(added).toEqual(['dates|src/eq.ts|require|moment']);
    expect(dropped).toEqual(['dates|src/eq.ts|import|moment', 'dates|src/gone.ts|import|moment']);
    expect(serializeBaseline(baseline)).not.toContain('upgradedFrom');
  });

  it('accepts raw 5-part ids too', () => {
    const rawV1 = { ...v1, allowed: ['forms|src/a.ts|import|redux-form|0'] };
    const current = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]);
    expect(reconcileMigratedBaseline(rawV1, current, meta).baseline.allowed).toEqual(['forms|src/a.ts|import|redux-form']);
  });
});
