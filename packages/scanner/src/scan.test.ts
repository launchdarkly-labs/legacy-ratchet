import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCANNER_VERSION, scanFiles, scanSource } from './index.js';
import { scanPaths } from './scan.js';

const fixtureRoot = fileURLToPath(new URL('./__fixtures__/repo', import.meta.url));

describe('SCANNER_VERSION', () => {
  it('equals package.json version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(SCANNER_VERSION).toBe(pkg.version);
  });
});

describe('scanFiles on the fixture repo', () => {
  it('scans every file end-to-end', async () => {
    const result = await scanFiles({ root: fixtureRoot });
    expect(result.errors).toEqual([]);
    expect(result.files).toBe(5);
    expect(result.imports).toEqual([
      { filePath: 'scripts/build.mjs', moduleSpecifier: 'node:fs', importKind: 'import', typeOnly: false, line: 1, column: 16 },
      { filePath: 'src/features/PaymentForm.tsx', moduleSpecifier: 'react', importKind: 'import', typeOnly: false, line: 1, column: 19 },
      { filePath: 'src/features/PaymentForm.tsx', moduleSpecifier: 'redux-form', importKind: 'import', typeOnly: false, line: 2, column: 27 },
      { filePath: 'src/features/PaymentForm.tsx', moduleSpecifier: 'redux-form/lib/types', importKind: 'import', typeOnly: true, line: 3, column: 32 },
      {
        filePath: 'src/features/lazy.ts',
        moduleSpecifier: 'old-charts',
        importKind: 'dynamic-import',
        typeOnly: false,
        line: 3,
        column: 30,
        suppression: { groupIds: ['charts'], reason: 'migrating in Q4' },
      },
      { filePath: 'src/index.ts', moduleSpecifier: './features/PaymentForm.js', importKind: 'export-from', typeOnly: false, line: 1, column: 15 },
      { filePath: 'src/index.ts', moduleSpecifier: './features/lazy.js', importKind: 'export-from', typeOnly: false, line: 2, column: 27 },
      { filePath: 'src/legacy/util.js', moduleSpecifier: 'moment', importKind: 'require', typeOnly: false, line: 1, column: 24 },
    ]);
  });

  it('is deterministic regardless of concurrency', async () => {
    const a = await scanFiles({ root: fixtureRoot, concurrency: 1 });
    const b = await scanFiles({ root: fixtureRoot, concurrency: 64 });
    expect(b).toEqual(a);
  });

  it('respects ignore and files', async () => {
    const ignored = await scanFiles({ root: fixtureRoot, ignore: ['src/features/**'] });
    expect(ignored.files).toBe(3);
    expect(ignored.imports.some((i) => i.filePath.startsWith('src/features/'))).toBe(false);

    const only = await scanFiles({ root: fixtureRoot, files: ['src/legacy/util.js', 'src/types.d.ts', 'nope.ts'] });
    expect(only.files).toBe(1);
    expect(only.imports.map((i) => i.moduleSpecifier)).toEqual(['moment']);
  });

  it('agrees with scanSource per file', async () => {
    const result = await scanFiles({ root: fixtureRoot });
    const code = readFileSync(path.join(fixtureRoot, 'src/features/PaymentForm.tsx'), 'utf8');
    expect(result.imports.filter((i) => i.filePath === 'src/features/PaymentForm.tsx')).toEqual(
      scanSource(code, 'src/features/PaymentForm.tsx'),
    );
  });
});

describe('unreadable files', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'lr-scanner-scan-'));
    mkdirSync(path.join(root, 'src/dir.ts'), { recursive: true });
    writeFileSync(path.join(root, 'src/ok.ts'), "import 'ok';\n");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('reports read failures in errors and keeps scanning the rest', async () => {
    const result = await scanPaths(root, ['src/dir.ts', 'src/gone.ts', 'src/ok.ts'], 2);
    expect(result.files).toBe(3);
    expect(result.imports.map((i) => [i.filePath, i.moduleSpecifier])).toEqual([['src/ok.ts', 'ok']]);
    expect(result.errors.map((e) => e.filePath)).toEqual(['src/dir.ts', 'src/gone.ts']);
    expect(result.errors[0]!.message).toMatch(/EISDIR/);
    expect(result.errors[1]!.message).toMatch(/ENOENT/);
  });

  it('scanFiles never lists directories or missing files, so they produce no errors', async () => {
    const result = await scanFiles({ root, files: ['src/dir.ts', 'src/gone.ts', 'src/ok.ts'] });
    expect(result).toEqual({
      imports: [{ filePath: 'src/ok.ts', moduleSpecifier: 'ok', importKind: 'import', typeOnly: false, line: 1, column: 8 }],
      files: 1,
      errors: [],
    });
  });

  it('handles invalid concurrency values', async () => {
    for (const c of [0, -3, Number.NaN, 2.7]) {
      const result = await scanPaths(root, ['src/ok.ts'], c);
      expect(result.imports).toHaveLength(1);
    }
  });
});
