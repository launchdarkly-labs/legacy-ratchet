import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { buildCruiseOptions, engineVersion, extractWithDepcruise } from './extract.js';

const fixtureRoot = fileURLToPath(new URL('../../scanner/src/__fixtures__/repo', import.meta.url));

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      chmodSync(t, 0o755);
    } catch {}
    rmSync(t, { recursive: true, force: true });
  }
});

function makeRepo(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'lr-depcruise-')));
  temps.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const fakePackage = (name: string) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    version: '1.0.0',
    main: 'index.js',
    types: 'index.d.ts',
  }),
  [`node_modules/${name}/index.js`]: 'module.exports = {};\n',
  [`node_modules/${name}/index.d.ts`]: 'export type T = string;\n',
});

const short = (imports: { filePath: string; moduleSpecifier: string; importKind: string; typeOnly: boolean }[]) =>
  imports.map((i) => `${i.filePath} ${i.importKind}${i.typeOnly ? '(type)' : ''} ${i.moduleSpecifier}`);

describe('extractWithDepcruise on the scanner fixture repo', () => {
  it('extracts every import with no positions, skipping .d.ts files', async () => {
    const result = await extractWithDepcruise({ root: fixtureRoot, cache: false });
    expect(result.errors).toEqual([]);
    expect(result.files).toEqual([
      'scripts/build.mjs',
      'src/features/PaymentForm.tsx',
      'src/features/lazy.ts',
      'src/index.ts',
      'src/legacy/util.js',
    ]);
    expect(short(result.imports)).toEqual([
      'scripts/build.mjs import node:fs',
      'src/features/PaymentForm.tsx import react',
      'src/features/PaymentForm.tsx import redux-form',
      'src/features/PaymentForm.tsx import redux-form/lib/types',
      'src/features/lazy.ts dynamic-import old-charts',
      'src/index.ts export-from ./features/lazy.js',
      'src/index.ts export-from ./features/PaymentForm.js',
      'src/legacy/util.js require moment',
    ]);
    expect(result.imports.every((i) => i.line === undefined && i.column === undefined)).toBe(true);
    expect(result.engineVersion).toMatch(/^dependency-cruiser@\d+\.\d+\.\d+/);
  });

  it('honours ignore and files', async () => {
    const ignored = await extractWithDepcruise({ root: fixtureRoot, cache: false, ignore: ['src/features/**'] });
    expect(ignored.files).toEqual(['scripts/build.mjs', 'src/index.ts', 'src/legacy/util.js']);
    const only = await extractWithDepcruise({
      root: fixtureRoot,
      cache: false,
      files: ['src/legacy/util.js', 'src/types.d.ts'],
    });
    expect(short(only.imports)).toEqual(['src/legacy/util.js require moment']);
  });
});

describe('extractWithDepcruise syntax coverage', () => {
  it('detects type-only imports (typescript must be loadable by dependency-cruiser)', async () => {
    const root = makeRepo({
      ...fakePackage('fake-types'),
      'src/types.ts': 'export type Local = number;\n',
      'src/a.ts': [
        "import type { Local } from './types';",
        "import type { T } from 'fake-types';",
        "import fake from 'fake-types';",
        "import { type T as T2 } from 'fake-types';",
        'export const x: Local | T | T2 = fake;',
        '',
      ].join('\n'),
    });
    const result = await extractWithDepcruise({ root, cache: false });
    expect(result.errors).toEqual([]);
    expect(short(result.imports)).toEqual([
      'src/a.ts import(type) ./types',
      'src/a.ts import fake-types',
      'src/a.ts import(type) fake-types',
    ]);
  });

  it('reports import-equals as import-equals and keeps every syntactic kind', async () => {
    const root = makeRepo({
      ...fakePackage('lodash'),
      ...fakePackage('redux-form'),
      'src/a.ts': [
        "import _ = require('lodash');",
        "export * from 'redux-form';",
        "export * from 'unresolved-reexport';",
        "const m = require('moment');",
        "void import('old-charts');",
        "type Lazy = typeof import('type-only-pkg');",
        '/// <reference types="node" />',
        'export const all = [_, m];',
        '',
      ].join('\n'),
    });
    const result = await extractWithDepcruise({ root, cache: false });
    expect(short(result.imports)).toEqual([
      'src/a.ts import-equals lodash',
      'src/a.ts require moment',
      'src/a.ts dynamic-import old-charts',
      'src/a.ts export-from redux-form',
      'src/a.ts import type-only-pkg',
      'src/a.ts import unresolved-reexport',
    ]);
  });

  it('keeps the imports of a listed file that another listed file imports (no maxDepth visit loss)', async () => {
    const root = makeRepo({
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': "import moment from 'moment';\nexport const b = moment;\n",
    });
    const result = await extractWithDepcruise({ root, cache: false });
    expect(short(result.imports)).toEqual(['src/a.ts import ./b', 'src/b.ts import moment']);
    expect(result.files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('handles file names with glob characters without pulling in neighbours', async () => {
    const root = makeRepo({
      'src/[id].ts': "import 'moment';\n",
      'src/i.ts': "import 'axios';\n",
      'src/(group)/c.ts': "import 'request';\n",
      'src/$param.ts': "import 'redux-form';\n",
    });
    const result = await extractWithDepcruise({
      root,
      cache: false,
      files: ['src/[id].ts', 'src/(group)/c.ts', 'src/$param.ts'],
    });
    expect(short(result.imports)).toEqual([
      'src/$param.ts import redux-form',
      'src/(group)/c.ts import request',
      'src/[id].ts import moment',
    ]);
  });

  it('resolves tsconfig paths when a tsConfig is given, keeping the specifier as written', async () => {
    const root = makeRepo({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/lib/*'] } },
        include: ['src'],
      }),
      'src/lib/x.ts': 'export type X = 1;\n',
      'src/a.ts': "import type { X } from '@app/x';\nexport const a: X = 1;\n",
    });
    const without = await extractWithDepcruise({ root, cache: false });
    expect(short(without.imports)).toEqual(['src/a.ts import @app/x']);
    const withTs = await extractWithDepcruise({ root, cache: false, tsConfig: 'tsconfig.json' });
    expect(short(withTs.imports)).toEqual(['src/a.ts import(type) @app/x']);
  });
});

describe('extractWithDepcruise prefilter', () => {
  it('only cruises files containing a prefilter string', async () => {
    const root = makeRepo({
      'src/a.ts': "import moment from 'moment';\nexport default moment;\n",
      'src/b.ts': "import axios from 'axios';\nexport default axios;\n",
    });
    const result = await extractWithDepcruise({ root, cache: false, prefilter: ['moment'] });
    expect(result.files).toEqual(['src/a.ts']);
    expect(short(result.imports)).toEqual(['src/a.ts import moment']);
  });

  it('returns an empty result when no file matches', async () => {
    const root = makeRepo({ 'src/a.ts': "import 'axios';\n" });
    const result = await extractWithDepcruise({ root, cache: false, prefilter: ['moment'] });
    expect(result).toMatchObject({ imports: [], files: [], errors: [] });
  });

  it('treats an empty prefilter as no prefilter', async () => {
    const root = makeRepo({ 'src/a.ts': "import 'axios';\n" });
    const result = await extractWithDepcruise({ root, cache: false, prefilter: [] });
    expect(result.files).toEqual(['src/a.ts']);
  });
});

describe('buildCruiseOptions', () => {
  it('forces the options migration-tracker relies on', () => {
    const { options, warnings } = buildCruiseOptions(
      {
        tsPreCompilationDeps: false,
        moduleSystems: ['amd'],
        maxDepth: 5,
        validate: true,
        outputType: 'err',
        doNotFollow: { path: 'src/vendor' },
        detectJSDocImports: true,
        exoticRequireStrings: ['want'],
        ruleSet: { forbidden: [] },
      },
      { root: '/repo', cache: false },
    );
    expect(options).toEqual({
      validate: false,
      tsPreCompilationDeps: true,
      parser: 'tsc',
      moduleSystems: ['es6', 'cjs'],
      detectJSDocImports: false,
      detectProcessBuiltinModuleCalls: false,
      doNotFollow: { path: '.' },
      maxDepth: 1,
      baseDir: '/repo',
      cache: false,
    });
    expect(warnings).toEqual([]);
  });

  it('keeps the user parser and resolution options', () => {
    const { options } = buildCruiseOptions(
      {
        parser: 'swc',
        tsConfig: { fileName: 'tsconfig.json' },
        enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import'] },
        externalModuleResolutionStrategy: 'yarn-pnp',
        preserveSymlinks: true,
        combinedDependencies: true,
        builtInModules: { override: [], add: ['electron'] },
      },
      { root: '/repo', cache: false },
    );
    expect(options).toMatchObject({
      parser: 'swc',
      tsConfig: { fileName: 'tsconfig.json' },
      enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import'] },
      externalModuleResolutionStrategy: 'yarn-pnp',
      preserveSymlinks: true,
      combinedDependencies: true,
      builtInModules: { override: [], add: ['electron'] },
    });
  });

  it('removes includeOnly and other result filters with a warning', () => {
    const { options, warnings } = buildCruiseOptions(
      { includeOnly: '^src', focus: '^src/a', reaches: 'x', collapse: 2 },
      { root: '/repo', cache: false },
    );
    expect(options).not.toHaveProperty('includeOnly');
    expect(options).not.toHaveProperty('focus');
    expect(options).not.toHaveProperty('reaches');
    expect(options).not.toHaveProperty('collapse');
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toContain('"includeOnly" is ignored');
  });

  it('neutralizes an exclude that matches node_modules, with a warning', () => {
    const { options, warnings } = buildCruiseOptions(
      { exclude: { path: ['node_modules', '\\.spec\\.ts$'], dynamic: true } },
      { root: '/repo', cache: false },
    );
    expect(options.exclude).toEqual({
      path: ['^(?!.*node_modules/).*?(?:node_modules)', '^(?!.*node_modules/).*?(?:\\.spec\\.ts$)'],
    });
    expect(warnings.some((w) => w.includes('node_modules/x/dist/index.js'))).toBe(true);
    expect(warnings.some((w) => w.includes('exclude.dynamic'))).toBe(true);
    const re = new RegExp((options.exclude as { path: string[] }).path.join('|'));
    expect(re.test('node_modules/x/dist/index.js')).toBe(false);
    expect(re.test('src/a.spec.ts')).toBe(true);
  });

  it('passes a local-only exclude through untouched', () => {
    const { options, warnings } = buildCruiseOptions({ exclude: '^src/generated' }, { root: '/repo', cache: false });
    expect(options.exclude).toEqual({ path: ['^src/generated'] });
    expect(warnings).toEqual([]);
  });

  it('defaults the cache to a separate content-strategy folder under root', () => {
    expect(buildCruiseOptions(undefined, { root: '/repo' }).options.cache).toEqual({
      folder: path.join('/repo', '.cache/migration-tracker/depcruise'),
      strategy: 'content',
    });
    expect(buildCruiseOptions(undefined, { root: '/repo', cache: '/tmp/c' }).options.cache).toEqual({
      folder: '/tmp/c',
      strategy: 'content',
    });
  });
});

describe('extractWithDepcruise with a depcruise config', () => {
  it('drops includeOnly and neutralizes a node_modules exclude so installed packages still count', async () => {
    const root = makeRepo({
      ...fakePackage('moment'),
      '.dependency-cruiser.cjs':
        "module.exports = { options: { includeOnly: '^src/only', exclude: { path: 'node_modules' }, doNotFollow: { path: 'node_modules' } } };\n",
      'src/a.ts': "import moment from 'moment';\nexport default moment;\n",
    });
    const result = await extractWithDepcruise({ root, cache: false, depcruiseConfig: '.dependency-cruiser.cjs' });
    expect(short(result.imports)).toEqual(['src/a.ts import moment']);
    expect(result.warnings.some((w) => w.includes('"includeOnly" is ignored'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('exclude.path matches'))).toBe(true);
  });
});

describe('extractWithDepcruise failures', () => {
  it.skipIf(process.getuid?.() === 0)(
    'turns a per-file failure into an error naming the file and returns no imports',
    async () => {
      const root = makeRepo({
        'src/a.ts': "import 'moment';\n",
        'src/broken.ts': "import 'axios';\n",
      });
      chmodSync(path.join(root, 'src/broken.ts'), 0o000);
      temps.push(path.join(root, 'src/broken.ts'));
      const result = await extractWithDepcruise({ root, cache: false });
      expect(result.imports).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.filePath).toBe('src/broken.ts');
      expect(result.errors[0]!.message).toContain('EACCES');
      expect(result.errors[0]!.message).toContain('add an ignore glob or use --engine scanner');
    },
  );
});

describe('extractWithDepcruise and process.cwd()', () => {
  it('gives the same result when cwd is not the root, and disables the cwd-bound cache', async () => {
    const root = makeRepo({
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': "import moment from 'moment';\nexport const b = moment;\n",
    });
    const before = process.cwd();
    const elsewhere = makeRepo({ 'src/a.ts': "import 'other';\n" });
    try {
      process.chdir(elsewhere);
      const result = await extractWithDepcruise({ root });
      expect(short(result.imports)).toEqual(['src/a.ts import ./b', 'src/b.ts import moment']);
      expect(result.warnings.some((w) => w.includes('cache disabled'))).toBe(true);
      expect(existsSync(path.join(root, '.cache'))).toBe(false);
    } finally {
      process.chdir(before);
    }
  });

  it('uses the content cache when cwd is the root', async () => {
    const root = makeRepo({ 'src/a.ts': "import 'moment';\n" });
    const before = process.cwd();
    try {
      process.chdir(root);
      const first = await extractWithDepcruise({ root });
      expect(first.warnings).toEqual([]);
      const folder = path.join(root, '.cache/migration-tracker/depcruise');
      const cacheFile = readdirSync(folder).map((f) => path.join(folder, f))[0]!;
      const written = statSync(cacheFile).mtimeMs;
      const second = await extractWithDepcruise({ root });
      expect(second.imports).toEqual(first.imports);
      expect(statSync(cacheFile).mtimeMs).toBe(written);
    } finally {
      process.chdir(before);
    }
  });
});

describe('engineVersion', () => {
  it('reads the installed dependency-cruiser version', () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../node_modules/dependency-cruiser/package.json', import.meta.url)), 'utf8'),
    ) as { version: string };
    expect(engineVersion()).toBe(`dependency-cruiser@${pkg.version}`);
  });
});

describe('map.ts purity', () => {
  it('does not import dependency-cruiser at runtime', () => {
    const source = readFileSync(fileURLToPath(new URL('./map.ts', import.meta.url)), 'utf8');
    const runtime = source.split('\n').filter((l) => /from 'dependency-cruiser/.test(l) && !/^import type /.test(l));
    expect(runtime).toEqual([]);
  });
});
