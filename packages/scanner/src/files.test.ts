import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeInputPath } from './files.js';
import { DEFAULT_EXTENSIONS, DEFAULT_IGNORE, listFiles } from './index.js';

let root: string;

const tree = [
  'src/a.ts',
  'src/b.tsx',
  'src/c.mts',
  'src/d.cts',
  'src/e.js',
  'src/f.jsx',
  'src/g.mjs',
  'src/h.cjs',
  'src/types.d.ts',
  'src/README.md',
  'src/style.css',
  'src/data.json',
  'src/generated/gen.ts',
  'app/[id]/page.tsx',
  'Z.ts',
  'node_modules/pkg/index.js',
  'packages/x/node_modules/dep/index.ts',
  'packages/x/src/index.ts',
  'dist/out.js',
  'build/out.js',
  'coverage/lcov.js',
  '.next/server.js',
  'out/o.js',
  '.storybook/main.ts',
  '.hidden.ts',
];

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'lr-scanner-files-'));
  for (const f of tree) {
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    writeFileSync(path.join(root, f), '');
  }
  mkdirSync(path.join(root, 'src/dir.ts'));
  symlinkSync('a.ts', path.join(root, 'src/link.ts'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('constants', () => {
  it('match the contract', () => {
    expect(DEFAULT_EXTENSIONS).toEqual(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
    expect(DEFAULT_IGNORE).toEqual([
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.git/**',
      '**/*.d.ts',
      '**/.next/**',
      '**/out/**',
    ]);
  });
});

describe('listFiles', () => {
  it('lists source files with default ignores, sorted, POSIX, no dotfiles, no dirs, no symlinks', async () => {
    expect(await listFiles({ root })).toEqual([
      'Z.ts',
      'app/[id]/page.tsx',
      'packages/x/src/index.ts',
      'src/a.ts',
      'src/b.tsx',
      'src/c.mts',
      'src/d.cts',
      'src/e.js',
      'src/f.jsx',
      'src/g.mjs',
      'src/generated/gen.ts',
      'src/h.cjs',
    ]);
  });

  it('adds custom ignore globs to the defaults', async () => {
    const files = await listFiles({ root, ignore: ['src/generated/**', '**/*.cjs'] });
    expect(files).not.toContain('src/generated/gen.ts');
    expect(files).not.toContain('src/h.cjs');
    expect(files).not.toContain('src/types.d.ts');
    expect(files).toContain('src/a.ts');
  });

  it('filters explicit files without walking: existing, extension, ignore rules', async () => {
    const files = await listFiles({
      root,
      files: [
        './src/a.ts',
        'src\\b.tsx',
        'src/a.ts',
        'src/README.md',
        'src/types.d.ts',
        'node_modules/pkg/index.js',
        'dist/out.js',
        'src/missing.ts',
        'src/dir.ts',
        'app/[id]/page.tsx',
        '../outside.ts',
        path.join(root, 'src/e.js'),
        'src/generated/gen.ts',
      ],
      ignore: ['src/generated/**'],
    });
    expect(files).toEqual(['app/[id]/page.tsx', 'src/a.ts', 'src/b.tsx', 'src/e.js']);
  });

  it('explicit dot-directory files are allowed when given', async () => {
    expect(await listFiles({ root, files: ['.storybook/main.ts'] })).toEqual(['.storybook/main.ts']);
  });

  it('returns [] for an empty files list', async () => {
    expect(await listFiles({ root, files: [] })).toEqual([]);
  });
});

describe('normalizeInputPath', () => {
  it('normalizes ./, backslashes, absolute paths and rejects escapes', () => {
    expect(normalizeInputPath('/r', './a/b.ts')).toBe('a/b.ts');
    expect(normalizeInputPath('/r', 'a\\b.ts')).toBe('a/b.ts');
    expect(normalizeInputPath('/r', 'a/../b.ts')).toBe('b.ts');
    expect(normalizeInputPath('/r', '/r/x/y.ts')).toBe('x/y.ts');
    expect(normalizeInputPath('/r', '/elsewhere/y.ts')).toBeUndefined();
    expect(normalizeInputPath('/r', '../y.ts')).toBeUndefined();
    expect(normalizeInputPath('/r', '.')).toBeUndefined();
  });
});
