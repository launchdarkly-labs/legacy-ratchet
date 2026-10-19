import { utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { CONFIG, makeFixture } from './__fixtures__/helpers.js';
import plugin, { rules } from './index.js';

function lint(root: string, rel: string, code: string, extra: Linter.Config[] = []): Linter.LintMessage[] {
  const linter = new Linter({ configType: 'flat', cwd: root });
  return linter.verify(
    code,
    [
      {
        files: ['**/*.{ts,tsx,js,md}'],
        languageOptions: { parser: tsParser as never, parserOptions: { ecmaFeatures: { jsx: true } } },
      },
      plugin.configs.recommended as Linter.Config,
      ...extra,
    ],
    { filename: path.join(root, rel) },
  );
}

describe('plugin object', () => {
  it('has meta, rules and a recommended config referencing the same plugin', () => {
    expect(plugin.meta).toEqual({ name: 'eslint-plugin-migration-tracker', version: expect.any(String) });
    expect(plugin.rules).toBe(rules);
    expect(Object.keys(plugin.rules)).toEqual(['no-legacy-imports']);
    expect(plugin.configs.recommended.name).toBe('migration-tracker/recommended');
    expect(plugin.configs.recommended.plugins?.['migration-tracker']).toBe(plugin);
    expect(plugin.configs.recommended.rules).toEqual({ 'migration-tracker/no-legacy-imports': 'error' });
    expect(rules['no-legacy-imports'].meta.docs?.url).toBeUndefined();
  });
});

describe('Linter integration (flat config)', () => {
  it('reports new sites with replacement and docs text', () => {
    const root = makeFixture({ allowed: [] });
    const messages = lint(root, 'src/a.ts', "import { reduxForm } from 'redux-form';\nimport m from 'moment';\nimport r from 'request';");
    expect(messages.map((m) => [m.ruleId, m.severity, m.line, m.column, m.message])).toEqual([
      [
        'migration-tracker/no-legacy-imports',
        2,
        1,
        27,
        'New import of "redux-form" is not allowed (forms). Use "react-hook-form" instead. See https://example.com/forms',
      ],
      ['migration-tracker/no-legacy-imports', 2, 2, 15, 'New import of "moment" is not allowed (dates). Use "date-fns" or "luxon" instead.'],
      ['migration-tracker/no-legacy-imports', 2, 3, 15, 'Import of "request" is banned (http).'],
    ]);
  });

  it('reports each occurrence of a site with the unchanged message text', () => {
    const root = makeFixture({ allowed: [] });
    const code = "import { reduxForm } from 'redux-form';\nconst lazy = import('redux-form');\nimport r from 'request';\nexport { get } from 'request';";
    expect(lint(root, 'src/a.ts', code).map((m) => [m.line, m.column, m.message])).toEqual([
      [1, 27, 'New import of "redux-form" is not allowed (forms). Use "react-hook-form" instead. See https://example.com/forms'],
      [2, 21, 'New import of "redux-form" is not allowed (forms). Use "react-hook-form" instead. See https://example.com/forms'],
      [3, 15, 'Import of "request" is banned (http).'],
      [4, 21, 'Import of "request" is banned (http).'],
    ]);
  });

  it('severity follows the ESLint config', () => {
    const root = makeFixture({ allowed: [] });
    const messages = lint(root, 'src/a.ts', "import 'redux-form';", [{ rules: { 'migration-tracker/no-legacy-imports': 'warn' } }]);
    expect(messages.map((m) => m.severity)).toEqual([1]);
  });

  it('invalid config yields one Program report listing the issues', () => {
    const root = makeFixture({ configText: JSON.stringify({ version: 1, groups: { Bad: { old: ['x'], new: [] } } }) });
    const messages = lint(root, 'src/a.ts', "import 'x';\nimport 'y';");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.line).toBe(1);
    expect(messages[0]?.message).toMatch(/^migration-tracker: invalid migrations\.json: groups/);
  });

  it('picks up config and baseline changes (mtime cache)', () => {
    const root = makeFixture({ allowed: [] });
    const code = "import { reduxForm } from 'redux-form';";
    expect(lint(root, 'src/a.ts', code)).toHaveLength(1);
    const baselinePath = path.join(root, '.migrations/baseline.json');
    writeFileSync(
      baselinePath,
      JSON.stringify({
        schemaVersion: 1,
        configDigest: 'sha256:0',
        scannerVersion: 'x',
        generatedAt: '2026-01-01T00:00:00.000Z',
        allowed: ['forms|src/a.ts|import|redux-form|0'],
      }),
    );
    const future = new Date(Date.now() + 10_000);
    utimesSync(baselinePath, future, future);
    expect(lint(root, 'src/a.ts', code)).toEqual([]);

    const configPath = path.join(root, 'migrations.json');
    writeFileSync(configPath, JSON.stringify({ ...CONFIG, groups: { ...CONFIG.groups, forms: { ...CONFIG.groups.forms, enforcement: { mode: 'ban' } } } }));
    utimesSync(configPath, future, future);
    expect(lint(root, 'src/a.ts', code).map((m) => m.message)).toEqual([
      'Import of "redux-form" is banned (forms). Use "react-hook-form" instead. See https://example.com/forms',
    ]);
  });

  it('uses the physical filename for processor virtual files', () => {
    const root = makeFixture({ allowed: [], config: { ...CONFIG, ignore: ['**/*.md'] } });
    const processor: Linter.Processor = {
      preprocess: (text: string) => [{ text, filename: '0.js' }],
      postprocess: (messages: Linter.LintMessage[][]) => messages.flat(),
    };
    const extra: Linter.Config[] = [{ files: ['**/*.md'], processor }];
    expect(lint(root, 'src/guide.md', "import 'request';", extra)).toEqual([]);
    const unignored = makeFixture({ allowed: [] });
    expect(lint(unignored, 'src/guide.md', "import 'request';", extra).map((m) => m.message)).toEqual([
      'Import of "request" is banned (http).',
    ]);
  });
});
