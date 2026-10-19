import { collectSites, validateConfig, type LegacyConfig, type RawImport } from '@legacy-ratchet/core';
import { scanSource } from '@legacy-ratchet/scanner';
import tsParser from '@typescript-eslint/parser';
import type { TSESLint } from '@typescript-eslint/utils';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { CRLF_BOM, EVERY_FORM_TS, JSX_FILE, PLAIN_JS } from '../../scanner/src/__fixtures__/forms.js';
import { CONFIG } from './__fixtures__/helpers.js';
import { collectRawImports } from './collect.js';

function collectWithEslint(code: string, filePath: string, parser: 'typescript' | 'espree'): RawImport[] {
  let collected: RawImport[] | undefined;
  const probe = {
    rules: {
      collect: {
        create(context: TSESLint.RuleContext<string, []>) {
          return {
            'Program:exit'(): void {
              collected = collectRawImports(context.sourceCode, filePath);
            },
          };
        },
      },
    },
  };
  const linter = new Linter({ configType: 'flat' });
  const messages = linter.verify(
    code,
    [
      {
        files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
        plugins: { probe: probe as never },
        languageOptions: {
          ...(parser === 'typescript' ? { parser: tsParser as never } : {}),
          sourceType: 'module',
          ecmaVersion: 'latest',
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: { 'probe/collect': 'error' },
      },
    ],
    { filename: filePath },
  );
  expect(messages.filter((m) => m.fatal)).toEqual([]);
  if (!collected) throw new Error('rule did not run');
  return collected;
}

const validated = validateConfig(CONFIG);
if (!validated.ok) throw new Error('fixture config invalid');
const config: LegacyConfig = validated.config;

function expectParity(code: string, filePath: string, parser: 'typescript' | 'espree'): RawImport[] {
  const expected = scanSource(code, filePath);
  const actual = collectWithEslint(code, filePath, parser);
  expect(actual).toEqual(expected);
  const expectedSites = collectSites(config, expected);
  const actualSites = collectSites(config, actual);
  expect(expectedSites.length).toBeGreaterThan(0);
  expect(actualSites.map((s) => s.id)).toEqual(expectedSites.map((s) => s.id));
  expect(actualSites).toEqual(expectedSites);
  return expected;
}

describe('parity with @legacy-ratchet/scanner scanSource', () => {
  it('every TypeScript form + suppressions (.ts)', () => {
    const expected = expectParity(EVERY_FORM_TS, 'src/every.ts', 'typescript');
    expect(expected.length).toBeGreaterThan(40);
    expect(collectSites(config, expected).map((s) => s.id)).toEqual([
      'dates|src/every.ts|import|moment',
      'dates|src/every.ts|require|moment',
      'forms|src/every.ts|import|redux-form',
      'forms|src/every.ts|import|redux-form/immutable',
      'forms|src/every.ts|require|redux-form',
      'http|src/every.ts|import|request',
      'http|src/every.ts|require|request',
      'utils|src/every.ts|import|lodash',
    ]);
  });

  it('JSX (.tsx and .jsx)', () => {
    for (const file of ['src/Form.tsx', 'src/Form.jsx']) {
      const expected = expectParity(JSX_FILE, file, 'typescript');
      expect(expected.length).toBe(5);
    }
  });

  it('plain JS with the default espree parser', () => {
    const expected = expectParity(PLAIN_JS, 'lib/a.cjs', 'espree');
    expect(expected.length).toBe(3);
  });

  it('CRLF line endings and a BOM', () => {
    const expected = expectParity(CRLF_BOM, 'src/bom.ts', 'typescript');
    expect(expected[0]?.column).toBe(16);
  });
});
