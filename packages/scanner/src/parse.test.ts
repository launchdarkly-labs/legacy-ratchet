import type { RawImport } from '@migration-tracker/core';
import { describe, expect, it } from 'vitest';
import { scanSource } from './index.js';

const specs = (r: RawImport[]) => r.map((i) => `${i.importKind}:${i.moduleSpecifier}${i.typeOnly ? ':type' : ''}`);

describe('scanSource import forms', () => {
  const tsCode = [
    "import def from 'a';",
    "import * as ns from 'b';",
    "import { x, y as z } from 'c';",
    "import 'd';",
    "import type { T } from 'e';",
    "import type Def from 'e2';",
    "import { type A, type B } from 'f';",
    "import { type A2, C } from 'g';",
    "import def2, { type A3 } from 'g2';",
    "import x2 = require('h');",
    "import type x3 = require('h2');",
    "import Alias = Some.Namespace;",
    "export * from 'i';",
    "export * as nsx from 'j';",
    "export { a } from 'k';",
    "export type { T2 } from 'l';",
    "export { type T3, type T4 } from 'l2';",
    "export { type T5, v } from 'l3';",
    "export type * from 'l4';",
    "export { local };",
    "const r = require('m');",
    "const r2 = require(`n`);",
    "const p = import('o');",
    "const p2 = import(`p`);",
    "const p3 = import('q', { with: { type: 'json' } });",
  ].join('\n');

  it('detects every form in a .ts file with correct kind and typeOnly', () => {
    expect(specs(scanSource(tsCode, 'src/a.ts'))).toEqual([
      'import:a',
      'import:b',
      'import:c',
      'import:d',
      'import:e:type',
      'import:e2:type',
      'import:f:type',
      'import:g',
      'import:g2',
      'import-equals:h',
      'import-equals:h2:type',
      'export-from:i',
      'export-from:j',
      'export-from:k',
      'export-from:l:type',
      'export-from:l2:type',
      'export-from:l3',
      'export-from:l4:type',
      'require:m',
      'require:n',
      'dynamic-import:o',
      'dynamic-import:p',
      'dynamic-import:q',
    ]);
  });

  it('copies filePath verbatim', () => {
    const r = scanSource("import 'a';", './weird\\path.ts');
    expect(r[0]!.filePath).toBe('./weird\\path.ts');
  });

  it.each(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])('works for %s files', (ext) => {
    const code = [
      "import a from 'esm';",
      "export { b } from 'reexport';",
      "const c = require('cjs');",
      "const d = import('dyn');",
    ].join('\n');
    expect(specs(scanSource(code, `file${ext}`))).toEqual([
      'import:esm',
      'export-from:reexport',
      'require:cjs',
      'dynamic-import:dyn',
    ]);
  });

  it('finds nested requires and dynamic imports anywhere', () => {
    const code = [
      'function f() {',
      "  if (x) { return require('in-fn'); }",
      "  const g = () => import('in-arrow');",
      '}',
      'class K { m() { return [require(`in-class`)]; } }',
      "const o = { k: require('in-object'), ...(await import('in-spread')) };",
      "f(require('in-arg'));",
    ].join('\n');
    expect(specs(scanSource(code, 'a.js'))).toEqual([
      'require:in-fn',
      'dynamic-import:in-arrow',
      'require:in-class',
      'require:in-object',
      'dynamic-import:in-spread',
      'require:in-arg',
    ]);
  });

  it('finds imports inside JSX expressions in .tsx and .jsx', () => {
    const code = [
      "import React from 'react';",
      'export const C = () => (',
      '  <div onClick={() => import("on-click")}>',
      "    {require('in-jsx').label}",
      '    <span>{`text`}</span>',
      '  </div>',
      ');',
    ].join('\n');
    for (const f of ['C.tsx', 'C.jsx', 'C.js']) {
      expect(specs(scanSource(code, f))).toEqual(['import:react', 'dynamic-import:on-click', 'require:in-jsx']);
    }
  });

  it('parses generics in .ts without treating them as JSX', () => {
    const code = "const id = <T>(x: T) => x;\nconst v = <any>require('cast');";
    expect(specs(scanSource(code, 'a.ts'))).toEqual(['require:cast']);
  });

  it('ignores non-literal and substitution template specifiers', () => {
    const code = [
      'const name = "x";',
      'import(name);',
      'import(`./locale/${name}`);',
      "import('a' + name);",
      'require(name);',
      'require(`${name}`);',
    ].join('\n');
    expect(scanSource(code, 'a.js')).toEqual([]);
  });

  it('ignores require.resolve, member requires, jest.mock, vi.mock, import.meta', () => {
    const code = [
      "require.resolve('r1');",
      "module.require('r2');",
      "foo.require('r3');",
      "jest.mock('r4');",
      "vi.mock('r5');",
      "jest.requireActual('r6');",
      'const u = import.meta.url;',
      "new URL('./x', import.meta.url);",
      "require('a', 'b');",
      'require();',
      "const s = 'require(\"in-string\")';",
      '// require("in-comment")',
    ].join('\n');
    expect(scanSource(code, 'a.ts')).toEqual([]);
  });

  it('still reports modules mocked by jest/vi when they are actually imported', () => {
    const code = "import x from 'm';\njest.mock('m');\nvi.mock('m');";
    expect(specs(scanSource(code, 'a.test.ts'))).toEqual(['import:m']);
  });

  it('reports 1-based line and column of the specifier quote', () => {
    const code = [
      "import a from 'a';",
      '',
      "    const b = require('b');",
      'import {',
      '  x,',
      "} from 'c';",
      "\tconst d = import(`d`);",
    ].join('\n');
    const r = scanSource(code, 'a.ts');
    expect(r.map((i) => [i.moduleSpecifier, i.line, i.column])).toEqual([
      ['a', 1, 15],
      ['b', 3, 23],
      ['c', 6, 8],
      ['d', 7, 19],
    ]);
  });

  it('handles CRLF line endings', () => {
    const r = scanSource("import a from 'a';\r\nimport b from 'b';\r\n", 'a.ts');
    expect(r.map((i) => [i.line, i.column])).toEqual([
      [1, 15],
      [2, 15],
    ]);
  });

  it('returns results ordered by position, nested ones included', () => {
    const code = "const a = require('outer' + require('inner'));\nimport b from 'b';";
    expect(scanSource(code, 'a.ts').map((i) => i.moduleSpecifier)).toEqual(['inner', 'b']);
  });

  it('tolerates syntax errors', () => {
    const code = "import a from 'a';\nconst = = ;\nfunction (\nimport b from 'b';";
    expect(scanSource(code, 'a.ts').map((i) => i.moduleSpecifier)).toContain('a');
  });

  it('does not emit a suppression property when none applies', () => {
    const [r] = scanSource("import a from 'a';", 'a.ts');
    expect(r).toEqual({
      filePath: 'a.ts',
      moduleSpecifier: 'a',
      importKind: 'import',
      typeOnly: false,
      line: 1,
      column: 15,
    });
    expect('suppression' in r!).toBe(false);
  });
});

describe('suppression directives inside JSX text', () => {
  it('does not treat JSX text that looks like a comment as a directive', () => {
    const code = [
      'export const A = () => (',
      '  <div>',
      '    // migration-tracker-disable-next-line -- not a comment',
      "    {require('moment')}",
      '  </div>',
      ');',
    ].join('\n');
    const [site] = scanSource(code, 'a.tsx');
    expect(site?.moduleSpecifier).toBe('moment');
    expect(site?.suppression).toBeUndefined();
  });

  it('still honors a real comment inside a JSX expression container', () => {
    const code = [
      'export const A = () => (',
      '  <div>',
      '    {/* migration-tracker-disable-next-line -- real */}',
      "    {require('moment')}",
      '  </div>',
      ');',
    ].join('\n');
    const [site] = scanSource(code, 'a.tsx');
    expect(site?.suppression).toEqual({ groupIds: [], reason: 'real' });
  });
});
