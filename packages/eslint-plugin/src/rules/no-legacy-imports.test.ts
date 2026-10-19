import { mkdtempSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';
import { CONFIG, makeFixture } from '../__fixtures__/helpers.js';
import { noLegacyImports } from './no-legacy-imports.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

const withBaseline = makeFixture({
  allowed: [
    { groupId: 'forms', filePath: 'src/a.ts', importKind: 'import', moduleSpecifier: 'redux-form' },
    { groupId: 'forms', filePath: 'src/two.ts', importKind: 'require', moduleSpecifier: 'redux-form' },
    { groupId: 'http', filePath: 'src/a.ts', importKind: 'import', moduleSpecifier: 'request' },
  ],
});
const noBaseline = makeFixture();
const invalidConfig = makeFixture({ configText: JSON.stringify({ version: 2, groups: {} }) });
const brokenJson = makeFixture({ configText: '{ not json' });
const invalidBaseline = makeFixture({ baselineText: '{"schemaVersion": 9}' });
const noConfigDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'legacy-ratchet-noconfig-')));
const customLayout = makeFixture({
  allowed: [],
  files: { 'config/legacy-ratchet.json': JSON.stringify(CONFIG) },
});

const f = (root: string, rel: string): string => path.join(root, rel);

ruleTester.run('no-legacy-imports', noLegacyImports, {
  valid: [
    { name: 'baselined site passes', filename: f(withBaseline, 'src/a.ts'), code: "import { reduxForm } from 'redux-form';" },
    {
      name: 'baselined site passes with other code moving it around',
      filename: f(withBaseline, 'src/a.ts'),
      code: "const x = 1;\n\n\nimport { reduxForm } from 'redux-form';",
    },
    {
      name: 'a second occurrence of a baselined specifier is not a new site',
      filename: f(withBaseline, 'src/two.ts'),
      code: "const a = require('redux-form');\nconst b = require('redux-form');",
    },
    {
      name: 'import(), export-from and import are the same site',
      filename: f(withBaseline, 'src/a.ts'),
      code: "export { reduxForm } from 'redux-form';\nconst lazy = import('redux-form');",
    },
    {
      name: 'import-equals is the same site as require',
      filename: f(withBaseline, 'src/two.ts'),
      code: "import forms = require('redux-form');",
    },
    {
      name: 'a second static import of a baselined specifier is not reported',
      filename: f(withBaseline, 'src/a.ts'),
      code: "import { reduxForm } from 'redux-form';\nimport { Field } from 'redux-form';",
    },
    {
      name: 'import + import() of a specifier baselined as a static import is one site',
      filename: f(withBaseline, 'src/a.ts'),
      code: "import { reduxForm } from 'redux-form';\nconst lazy = () => import('redux-form');",
    },
    {
      name: 'require + import-equals of a baselined require site are one site',
      filename: f(withBaseline, 'src/two.ts'),
      code: "import forms = require('redux-form');\nconst again = require('redux-form');",
    },
    {
      name: 'every occurrence suppressed silences the site',
      filename: f(withBaseline, 'src/b.ts'),
      code: [
        '// legacy-ratchet-disable-next-line forms -- legacy',
        "const a = require('redux-form');",
        "const b = require('redux-form'); // legacy-ratchet-disable-line -- legacy too",
      ].join('\n'),
    },
    {
      name: 'every ban occurrence suppressed silences the site',
      filename: f(withBaseline, 'src/b.ts'),
      code: [
        '// legacy-ratchet-disable-next-line http -- vendor shim',
        "import request from 'request';",
        '// legacy-ratchet-disable-next-line http -- vendor shim',
        "export { get } from 'request';",
      ].join('\n'),
    },
    {
      name: 'exceptions silence every occurrence, suppressed or not',
      filename: f(withBaseline, 'src/legacy/wizard.ts'),
      code: "import { reduxForm } from 'redux-form';\n// legacy-ratchet-disable-next-line forms\nconst lazy = import('redux-form');",
    },
    {
      name: 'ratchet without baseline stays silent with several occurrences',
      filename: f(noBaseline, 'src/b.ts'),
      code: "import { reduxForm } from 'redux-form';\nconst lazy = import('redux-form');\nconst r = require('redux-form');",
    },
    { name: 'report mode is silent', filename: f(withBaseline, 'src/b.ts'), code: "import _ from 'lodash';" },
    { name: 'prefix of a package name is not matched', filename: f(withBaseline, 'src/b.ts'), code: "import x from 'redux-form-extra';" },
    { name: 'unrelated + relative imports', filename: f(withBaseline, 'src/b.ts'), code: "import a from 'react';\nimport b from './redux-form';" },
    { name: 'ratchet without baseline reports nothing', filename: f(noBaseline, 'src/b.ts'), code: "import { reduxForm } from 'redux-form';\nimport moment from 'moment';" },
    {
      name: 'disable-next-line with reason',
      filename: f(withBaseline, 'src/b.ts'),
      code: "// legacy-ratchet-disable-next-line forms -- migrating in JIRA-1\nimport { reduxForm } from 'redux-form';",
    },
    {
      name: 'disable-line with reason (block comment, all groups)',
      filename: f(withBaseline, 'src/b.ts'),
      code: "import { reduxForm } from 'redux-form'; /* legacy-ratchet-disable-line -- temporary */",
    },
    {
      name: 'disable-next-line above a require call inside a declaration',
      filename: f(withBaseline, 'src/b.ts'),
      code: "const x = {\n  // legacy-ratchet-disable-next-line forms, dates -- legacy\n  a: require('redux-form'),\n};",
    },
    {
      name: 'suppression also silences ban mode',
      filename: f(withBaseline, 'src/b.ts'),
      code: "// legacy-ratchet-disable-next-line http -- vendor shim\nimport request from 'request';",
    },
    { name: 'config.ignore skips the file', filename: f(withBaseline, 'generated/api.ts'), code: "import request from 'request';\nimport 'redux-form';" },
    { name: 'exceptions silence', filename: f(withBaseline, 'src/legacy/wizard.ts'), code: "import { reduxForm } from 'redux-form';" },
    { name: 'no legacy.json is a no-op', filename: f(noConfigDir, 'src/a.ts'), code: "import request from 'request';" },
    {
      name: 'non-import forms are ignored',
      filename: f(withBaseline, 'src/b.ts'),
      code: [
        "require.resolve('redux-form');",
        "jest.mock('redux-form');",
        "vi.mock('redux-form');",
        "type T = typeof import('redux-form');",
        'const name = "redux-form";',
        'import(name);',
        'require(name);',
        "require('redux-form', 1);",
        "(require)('redux-form');",
        "require(('redux-form'));",
        'require(`redux-${name}`);',
        "foo.require('redux-form');",
        "declare module 'redux-form' {}",
      ].join('\n'),
    },
    {
      name: 'file outside the configured root is skipped',
      filename: f(noConfigDir, 'x.ts'),
      code: "import request from 'request';",
      options: [{ root: withBaseline }],
    },
  ],
  invalid: [
    {
      name: 'new import with replacement and docs',
      filename: f(withBaseline, 'src/b.ts'),
      code: "import { reduxForm } from 'redux-form';",
      errors: [{ messageId: 'newImport', line: 1, column: 27, endColumn: 39}],
    },
    {
      name: 'multiple replacements, no docs',
      filename: f(withBaseline, 'src/b.ts'),
      code: "import moment from 'moment';",
      errors: [{ messageId: 'newImport' }],
    },
    {
      name: 'ban mode reports even when baselined',
      filename: f(withBaseline, 'src/a.ts'),
      code: "import { reduxForm } from 'redux-form';\nimport request from 'request';",
      errors: [{ messageId: 'banned', line: 2 }],
    },
    {
      name: 'ban mode reports without a baseline',
      filename: f(noBaseline, 'src/a.ts'),
      code: "import request from 'request';\nimport 'redux-form';",
      errors: [{ messageId: 'banned', line: 1 }],
    },
    {
      name: 'a new site reports every occurrence',
      filename: f(withBaseline, 'src/b.ts'),
      code: "const a = require('redux-form');\nconst b = require('redux-form');",
      errors: [
        { messageId: 'newImport', line: 1, column: 19 },
        { messageId: 'newImport', line: 2, column: 19 },
      ],
    },
    {
      name: 'a partly suppressed site reports only the unsuppressed occurrences',
      filename: f(withBaseline, 'src/b.ts'),
      code: "// legacy-ratchet-disable-next-line forms -- legacy\nconst a = require('redux-form');\nconst b = require('redux-form');",
      errors: [{ messageId: 'newImport', line: 3, column: 19 }],
    },
    {
      name: 'ban mode reports every occurrence',
      filename: f(withBaseline, 'src/a.ts'),
      code: "import request from 'request';\nexport { get } from 'request';",
      errors: [
        { messageId: 'banned', line: 1, column: 21 },
        { messageId: 'banned', line: 2, column: 21 },
      ],
    },
    {
      name: 'ban mode without a baseline reports every occurrence',
      filename: f(noBaseline, 'src/a.ts'),
      code: "import request from 'request';\nconst lazy = import('request');",
      errors: [
        { messageId: 'banned', line: 1 },
        { messageId: 'banned', line: 2 },
      ],
    },
    {
      name: 'a partly suppressed ban site reports only the unsuppressed occurrence',
      filename: f(withBaseline, 'src/b.ts'),
      code: "import request from 'request';\n// legacy-ratchet-disable-next-line http -- vendor shim\nexport { get } from 'request';",
      errors: [{ messageId: 'banned', line: 1 }],
    },
    {
      name: 'an occurrence suppressed without a reason is reported alongside the rest',
      filename: f(withBaseline, 'src/b.ts'),
      code: [
        '// legacy-ratchet-disable-next-line forms',
        "import { reduxForm } from 'redux-form';",
        '// legacy-ratchet-disable-next-line forms -- legacy',
        "const lazy = import('redux-form');",
      ].join('\n'),
      errors: [{ messageId: 'newImport', line: 2 }],
    },
    {
      name: 'an occurrence suppressed for another group is still reported',
      filename: f(withBaseline, 'src/b.ts'),
      code: [
        '// legacy-ratchet-disable-next-line dates -- wrong group',
        "import { reduxForm } from 'redux-form';",
        '// legacy-ratchet-disable-next-line forms -- legacy',
        "const lazy = import('redux-form');",
      ].join('\n'),
      errors: [{ messageId: 'newImport', line: 2 }],
    },
    {
      name: 'require + import-equals of a new specifier merge into one site, reported at each node',
      filename: f(withBaseline, 'src/b.ts'),
      code: "import forms = require('redux-form');\nconst again = require('redux-form');",
      errors: [
        { messageId: 'newImport', line: 1 },
        { messageId: 'newImport', line: 2 },
      ],
    },
    {
      name: 'import-equals is a require site, not covered by a baselined static import',
      filename: f(withBaseline, 'src/a.ts'),
      code: "import { reduxForm } from 'redux-form';\nimport forms = require('redux-form');",
      errors: [{ messageId: 'newImport', line: 2 }],
    },
    {
      name: 'subpath is matched (different specifier = different identity)',
      filename: f(withBaseline, 'src/a.ts'),
      code: "import { reduxForm } from 'redux-form';\nimport { Field } from 'redux-form/immutable';",
      errors: [{ messageId: 'newImport', line: 2}],
    },
    {
      name: 'same specifier with a different module system is a new site',
      filename: f(withBaseline, 'src/a.ts'),
      code: "const forms = require('redux-form');",
      errors: [{ messageId: 'newImport' }],
    },
    {
      name: 'suppression without reason does not silence',
      filename: f(withBaseline, 'src/b.ts'),
      code: "// legacy-ratchet-disable-next-line forms\nimport { reduxForm } from 'redux-form';",
      errors: [{ messageId: 'newImport', line: 2 }],
    },
    {
      name: 'suppression for another group does not silence',
      filename: f(withBaseline, 'src/b.ts'),
      code: "import { reduxForm } from 'redux-form'; // legacy-ratchet-disable-line dates -- nope",
      errors: [{ messageId: 'newImport' }],
    },
    {
      name: 'disable-next-line two lines above does not apply',
      filename: f(withBaseline, 'src/b.ts'),
      code: "// legacy-ratchet-disable-next-line -- too far\n\nimport { reduxForm } from 'redux-form';",
      errors: [{ messageId: 'newImport' }],
    },
    {
      name: 'every import form',
      filename: f(withBaseline, 'src/b.ts'),
      code: [
        "import type { FormProps } from 'redux-form';",
        "import { type A, type B } from 'redux-form';",
        "import 'redux-form';",
        "import ns = require('redux-form');",
        "export import ns2 = require('redux-form');",
        "export * from 'redux-form';",
        "export * as forms from 'redux-form';",
        "export type { C } from 'redux-form';",
        "const r = require('redux-form');",
        'const t = require(`redux-form`);',
        "const d = import('redux-form');",
        'const e = import(`redux-form`);',
        "const o = require?.('redux-form');",
      ].join('\n'),
      errors: Array.from({ length: 13 }, (_, i) => ({ messageId: 'newImport' as const, line: i + 1 })),
    },
    {
      name: 'JSX file',
      filename: f(withBaseline, 'src/Form.tsx'),
      code: "import { reduxForm } from 'redux-form';\nexport const F = () => <div>{/* legacy-ratchet-disable-next-line */}</div>;",
      errors: [{ messageId: 'newImport', line: 1 }],
    },
    {
      name: 'invalid legacy.json → single Program report',
      filename: f(invalidConfig, 'src/a.ts'),
      code: "import { reduxForm } from 'redux-form';\nimport request from 'request';",
      errors: [{ messageId: 'invalidConfig', line: 1, column: 1 }],
    },
    {
      name: 'unparsable legacy.json → single Program report',
      filename: f(brokenJson, 'src/a.ts'),
      code: "import { reduxForm } from 'redux-form';",
      errors: [{ messageId: 'invalidConfig' }],
    },
    {
      name: 'invalid baseline → single Program report',
      filename: f(invalidBaseline, 'src/a.ts'),
      code: "import { reduxForm } from 'redux-form';",
      errors: [{ messageId: 'invalidBaseline' }],
    },
    {
      name: 'configPath option sets the root to its directory',
      filename: f(customLayout, 'config/x.ts'),
      code: "import request from 'request';",
      options: [{ configPath: f(customLayout, 'config/legacy-ratchet.json') }],
      errors: [{ messageId: 'banned' }],
    },
    {
      name: 'root option with baselinePath',
      filename: f(noConfigDir, 'src/x.ts'),
      code: "import { reduxForm } from 'redux-form';",
      options: [{ root: noConfigDir, configPath: f(withBaseline, 'legacy.json'), baselinePath: f(withBaseline, '.legacy/baseline.json') }],
      errors: [{ messageId: 'newImport' }],
    },
  ],
});

