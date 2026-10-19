import type { DependencyType, ICruiseResult, IDependency, IModule, ModuleSystemType } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

import { fromCruiseResult, rawKindOf } from './map.js';

function dep(
  module: string,
  moduleSystem: ModuleSystemType,
  dependencyTypes: DependencyType[],
  extra: Partial<IDependency> = {},
): IDependency {
  return {
    module,
    moduleSystem,
    dependencyTypes,
    resolved: module,
    circular: false,
    coreModule: false,
    couldNotResolve: false,
    dynamic: false,
    exoticallyRequired: false,
    followable: false,
    protocol: undefined as unknown as IDependency['protocol'],
    mimeType: undefined as unknown as string,
    valid: true,
    instability: 0,
    ...extra,
  };
}

function mod(source: string, dependencies: IDependency[] = [], extra: Partial<IModule> = {}): IModule {
  return { source, valid: true, dependencies, dependents: [], ...extra };
}

function result(modules: IModule[]): ICruiseResult {
  return {
    modules,
    summary: { error: 0, warn: 0, info: 0, ignore: 0, totalCruised: modules.length, violations: [], optionsUsed: {} },
  };
}

const opts = { root: '/repo', baseDir: '/repo', ignore: [] as string[] };

describe('rawKindOf', () => {
  it.each<[string, IDependency, string | undefined]>([
    ['import-equals beats require and cjs', dep('a', 'cjs', ['local', 'import-equals', 'require']), 'import-equals'],
    ['export beats import', dep('a', 'es6', ['local', 'export', 'import']), 'export-from'],
    ['dynamic-import type', dep('a', 'es6', ['npm', 'dynamic-import']), 'dynamic-import'],
    ['dynamic flag with unknown types', dep('a', 'es6', ['unknown'], { dynamic: true }), 'dynamic-import'],
    ['require type', dep('a', 'cjs', ['npm', 'require']), 'require'],
    ['import type', dep('a', 'es6', ['npm', 'import']), 'import'],
    ['type-only import is still an import', dep('a', 'es6', ['local', 'type-only', 'import']), 'import'],
    ['es6 fallback (unresolved)', dep('a', 'es6', ['unknown']), 'import'],
    ['cjs fallback (unresolved)', dep('a', 'cjs', ['unknown']), 'require'],
    ['amd is skipped', dep('a', 'amd', ['amd-define']), undefined],
    ['amd with require types is skipped', dep('a', 'amd', ['npm', 'require']), undefined],
    ['tsd is skipped', dep('a', 'tsd', ['triple-slash-type-reference']), undefined],
    ['type-import is skipped', dep('a', 'es6', ['npm', 'type-import']), undefined],
    ['triple-slash-directive is skipped', dep('a', 'es6', ['triple-slash-directive']), undefined],
    ['triple-slash-file-reference is skipped', dep('a', 'es6', ['triple-slash-file-reference']), undefined],
    ['triple-slash-type-reference is skipped', dep('a', 'es6', ['triple-slash-type-reference']), undefined],
    ['triple-slash-amd-dependency is skipped', dep('a', 'es6', ['triple-slash-amd-dependency']), undefined],
    ['jsdoc is skipped', dep('a', 'es6', ['npm', 'type-only', 'import', 'jsdoc', 'jsdoc-import-tag']), undefined],
    ['jsdoc-bracket-import is skipped', dep('a', 'es6', ['jsdoc-bracket-import']), undefined],
    ['exotic-require is skipped', dep('a', 'cjs', ['npm', 'exotic-require']), undefined],
    [
      'unresolved exotic require is skipped via the flag',
      dep('a', 'cjs', ['unknown'], { exoticallyRequired: true }),
      undefined,
    ],
    ['process-get-builtin-module is skipped', dep('fs', 'cjs', ['core', 'process-get-builtin-module']), undefined],
  ])('%s', (_name, d, expected) => {
    expect(rawKindOf(d)).toBe(expected);
  });
});

describe('fromCruiseResult dependency mapping', () => {
  it('maps every kind, keeps local/core/aliased specifiers and sets typeOnly', () => {
    const out = fromCruiseResult(
      result([
        mod('src/a.ts', [
          dep('./b', 'es6', ['local', 'import']),
          dep('fs', 'es6', ['core', 'import'], { coreModule: true }),
          dep('@app/x', 'es6', ['aliased', 'aliased-tsconfig-paths', 'local', 'import']),
          dep('moment', 'es6', ['npm', 'type-only', 'import']),
          dep('moment', 'es6', ['npm', 'import']),
          dep('lodash', 'cjs', ['npm', 'import-equals']),
          dep('redux-form', 'es6', ['npm', 'export']),
          dep('old', 'es6', ['unknown'], { dynamic: true, couldNotResolve: true }),
          dep('req', 'cjs', ['unknown'], { couldNotResolve: true }),
          dep('t', 'es6', ['npm', 'type-import']),
          dep('lib', 'tsd', ['triple-slash-type-reference']),
        ]),
      ]),
      opts,
    );
    expect(out.imports).toEqual([
      { filePath: 'src/a.ts', moduleSpecifier: './b', importKind: 'import', typeOnly: false },
      { filePath: 'src/a.ts', moduleSpecifier: 'fs', importKind: 'import', typeOnly: false },
      { filePath: 'src/a.ts', moduleSpecifier: '@app/x', importKind: 'import', typeOnly: false },
      { filePath: 'src/a.ts', moduleSpecifier: 'moment', importKind: 'import', typeOnly: true },
      { filePath: 'src/a.ts', moduleSpecifier: 'moment', importKind: 'import', typeOnly: false },
      { filePath: 'src/a.ts', moduleSpecifier: 'lodash', importKind: 'import-equals', typeOnly: false },
      { filePath: 'src/a.ts', moduleSpecifier: 'redux-form', importKind: 'export-from', typeOnly: false },
      { filePath: 'src/a.ts', moduleSpecifier: 'old', importKind: 'dynamic-import', typeOnly: false },
      { filePath: 'src/a.ts', moduleSpecifier: 'req', importKind: 'require', typeOnly: false },
    ]);
    for (const i of out.imports) {
      expect(i).not.toHaveProperty('line');
      expect(i).not.toHaveProperty('column');
    }
    expect(out.files).toEqual(['src/a.ts']);
  });

  it('restores node:/bun: protocols that dependency-cruiser strips, but leaves others alone', () => {
    const out = fromCruiseResult(
      result([
        mod('src/a.ts', [
          dep('fs', 'es6', ['core', 'import'], { coreModule: true, protocol: 'node:' }),
          dep('node:test', 'es6', ['core', 'import'], { coreModule: true, protocol: 'node:' }),
          dep('data:x', 'es6', ['unknown'], { protocol: 'data:' }),
        ]),
      ]),
      opts,
    );
    expect(out.imports.map((i) => i.moduleSpecifier)).toEqual(['node:fs', 'node:test', 'data:x']);
  });

  it('merges duplicate module entries for the same source (do-not-follow stub + real module)', () => {
    const out = fromCruiseResult(
      result([
        mod('src/b.ts'),
        mod('src/a.ts', [dep('./b', 'es6', ['local', 'import'])]),
        mod('src/b.ts', [dep('moment', 'es6', ['npm', 'import'])]),
      ]),
      opts,
    );
    expect(out.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(out.imports.map((i) => `${i.filePath}>${i.moduleSpecifier}`)).toEqual(['src/a.ts>./b', 'src/b.ts>moment']);
  });
});

describe('fromCruiseResult module filter', () => {
  const m = (source: string, extra: Partial<IModule> = {}) =>
    mod(source, [dep('moment', 'es6', ['npm', 'import'])], extra);

  it('drops core, unresolved, node_modules, outside-root, declaration, wrong-extension and ignored modules', () => {
    const out = fromCruiseResult(
      result([
        m('fs', { coreModule: true }),
        m('nope', { couldNotResolve: true }),
        m('node_modules/moment/moment.js'),
        m('packages/a/node_modules/x/index.js'),
        m('../outside/a.ts'),
        m('/elsewhere/a.ts'),
        m('src/types.d.ts'),
        m('src/types.d.mts'),
        m('src/types.d.cts'),
        m('src/style.css'),
        m('src/data.json'),
        m('dist/bundle.js'),
        m('src/gen/__generated__/a.ts'),
        m('src/keep.tsx'),
        m('src/keep.cjs'),
      ]),
      { ...opts, ignore: ['**/__generated__/**'] },
    );
    expect(out.files).toEqual(['src/keep.cjs', 'src/keep.tsx']);
    expect(Object.fromEntries(out.skipped.map((s) => [s.filePath, s.reason]))).toEqual({
      fs: 'core module',
      nope: 'could not resolve',
      'node_modules/moment/moment.js': 'under node_modules',
      'packages/a/node_modules/x/index.js': 'under node_modules',
      '../outside/a.ts': 'outside root',
      '/elsewhere/a.ts': 'outside root',
      'src/types.d.ts': 'declaration file',
      'src/types.d.mts': 'declaration file',
      'src/types.d.cts': 'declaration file',
      'src/style.css': 'unsupported extension',
      'src/data.json': 'unsupported extension',
      'dist/bundle.js': 'ignored',
      'src/gen/__generated__/a.ts': 'ignored',
    });
  });

  it('re-bases sources from baseDir to root', () => {
    const out = fromCruiseResult(result([m('src/a.ts'), m('../other/b.ts'), m('/repo/packages/web/src/c.ts')]), {
      root: '/repo',
      baseDir: '/repo/packages/web',
      ignore: [],
    });
    expect(out.files).toEqual(['packages/other/b.ts', 'packages/web/src/a.ts', 'packages/web/src/c.ts']);
    expect(out.imports.map((i) => i.filePath)).toEqual(out.files);
  });

  it('treats a baseDir above root as such', () => {
    const out = fromCruiseResult(result([m('app/src/a.ts'), m('lib/b.ts')]), {
      root: '/repo/app',
      baseDir: '/repo',
      ignore: [],
    });
    expect(out.files).toEqual(['src/a.ts']);
    expect(out.skipped).toEqual([{ filePath: 'lib/b.ts', reason: 'outside root' }]);
  });

  it('normalizes Windows-style separators', () => {
    const out = fromCruiseResult(result([m('src\\win\\a.ts')]), opts);
    expect(out.files).toEqual(['src/win/a.ts']);
  });

  it('restricts to opts.files when given', () => {
    const out = fromCruiseResult(result([m('src/a.ts'), m('src/b.ts')]), { ...opts, files: new Set(['src/b.ts']) });
    expect(out.files).toEqual(['src/b.ts']);
    expect(out.imports.map((i) => i.filePath)).toEqual(['src/b.ts']);
    expect(out.skipped).toEqual([{ filePath: 'src/a.ts', reason: 'not in file list' }]);
  });
});
