import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fingerprint, migrateSiteIdV1, normalizePath, parseSiteId, siteId, siteIdForImport, siteKindOf } from './index.js';
import { config } from './__fixtures__/helpers.js';

describe('fingerprint', () => {
  it('is the first 16 hex chars of sha256(kind NUL spec)', () => {
    const expected = createHash('sha256').update('import\u0000redux-form').digest('hex').slice(0, 16);
    expect(fingerprint('import', 'redux-form')).toBe(expected);
    expect(fingerprint('import', 'redux-form')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs by kind and specifier', () => {
    expect(fingerprint('import', 'x')).not.toBe(fingerprint('require', 'x'));
    expect(fingerprint('import', 'x')).not.toBe(fingerprint('import', 'x/y'));
  });
});

describe('siteKindOf', () => {
  it('maps syntactic kinds to module-system kinds', () => {
    expect(siteKindOf('import')).toBe('import');
    expect(siteKindOf('export-from')).toBe('import');
    expect(siteKindOf('dynamic-import')).toBe('import');
    expect(siteKindOf('require')).toBe('require');
    expect(siteKindOf('import-equals')).toBe('require');
  });
});

describe('siteId / parseSiteId', () => {
  const key = { groupId: 'forms', filePath: 'src/a.tsx', importKind: 'import' as const, moduleSpecifier: '@company/legacy-forms/x' };

  it('formats 4-part ids', () => {
    expect(siteId(key)).toBe('forms|src/a.tsx|import|@company/legacy-forms/x');
  });

  it('roundtrips', () => {
    expect(parseSiteId(siteId(key))).toEqual(key);
    expect(parseSiteId(siteId({ ...key, importKind: 'require' }))).toEqual({ ...key, importKind: 'require' });
  });

  it('rejects 5-part v1 ids with a migrate hint', () => {
    expect(() => parseSiteId('forms|src/a.tsx|import|x|0')).toThrow(/migration-tracker baseline migrate/);
  });

  it('throws on wrong arity or malformed parts', () => {
    expect(() => parseSiteId('forms|src/a.tsx|import')).toThrow(/4/);
    expect(() => parseSiteId('forms|src/a.tsx|import|x|0|extra')).toThrow(/4/);
    expect(() => parseSiteId('forms|src/a.tsx|bogus|x')).toThrow(/import kind/);
    expect(() => parseSiteId('forms|src/a.tsx|export-from|x')).toThrow(/import kind/);
    expect(() => parseSiteId('forms|src/a.tsx|dynamic-import|x')).toThrow(/import kind/);
    expect(() => parseSiteId('forms||import|x')).toThrow(/non-empty/);
    expect(() => parseSiteId('')).toThrow();
  });
});

describe('migrateSiteIdV1', () => {
  it.each([
    ['forms|src/a.ts|import|redux-form|0', 'forms|src/a.ts|import|redux-form'],
    ['forms|src/a.ts|import|redux-form|3', 'forms|src/a.ts|import|redux-form'],
    ['forms|src/a.ts|export-from|redux-form/x|0', 'forms|src/a.ts|import|redux-form/x'],
    ['forms|src/a.ts|dynamic-import|redux-form|1', 'forms|src/a.ts|import|redux-form'],
    ['forms|src/a.ts|require|redux-form|0', 'forms|src/a.ts|require|redux-form'],
    ['forms|src/a.ts|import-equals|redux-form|0', 'forms|src/a.ts|require|redux-form'],
  ])('%s -> %s', (v1, v2) => {
    expect(migrateSiteIdV1(v1)).toBe(v2);
  });

  it.each([
    'forms|src/a.ts|import|redux-form',
    'forms|src/a.ts|bogus|redux-form|0',
    'forms|src/a.ts|import|redux-form|01',
    'forms|src/a.ts|import|redux-form|-1',
    'forms|src/a.ts|import||0',
    '|src/a.ts|import|x|0',
    'not-a-site-id',
    '',
  ])('returns undefined for %j', (id) => {
    expect(migrateSiteIdV1(id)).toBeUndefined();
  });
});

describe('siteIdForImport', () => {
  const cfg = config({ version: 1, groups: { forms: { old: ['redux-form'] } } });
  const base = { filePath: './src/a.ts', moduleSpecifier: 'redux-form/immutable', typeOnly: false };

  it('builds the 4-part id with the module-system kind and normalized path', () => {
    expect(siteIdForImport(cfg, { ...base, importKind: 'import' })).toBe('forms|src/a.ts|import|redux-form/immutable');
    expect(siteIdForImport(cfg, { ...base, importKind: 'dynamic-import' })).toBe('forms|src/a.ts|import|redux-form/immutable');
    expect(siteIdForImport(cfg, { ...base, importKind: 'import-equals' })).toBe('forms|src/a.ts|require|redux-form/immutable');
  });

  it('is undefined for unmatched specifiers', () => {
    expect(siteIdForImport(cfg, { ...base, moduleSpecifier: 'react', importKind: 'import' })).toBeUndefined();
  });
});

describe('normalizePath', () => {
  it('produces repo-relative POSIX paths without leading ./', () => {
    expect(normalizePath('./src/a.ts')).toBe('src/a.ts');
    expect(normalizePath('src\\features\\a.ts')).toBe('src/features/a.ts');
    expect(normalizePath('.\\src\\a.ts')).toBe('src/a.ts');
    expect(normalizePath('src//x/./a.ts')).toBe('src/x/a.ts');
    expect(normalizePath('src/x/../a.ts')).toBe('src/a.ts');
    expect(normalizePath('src/a.ts')).toBe('src/a.ts');
  });

  it('strips the root', () => {
    expect(normalizePath('/repo/src/a.ts', '/repo')).toBe('src/a.ts');
    expect(normalizePath('/repo/src/a.ts', '/repo/')).toBe('src/a.ts');
    expect(normalizePath('C:\\repo\\src\\a.ts', 'C:\\repo')).toBe('src/a.ts');
    expect(normalizePath('/repository/a.ts', '/repo')).toBe('/repository/a.ts');
    expect(normalizePath('src/a.ts', '/repo')).toBe('src/a.ts');
  });
});
