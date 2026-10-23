import type { CheckResult, ImportSite, Violation } from '@migration-tracker/core';
import { describe, expect, it } from 'vitest';

import { createColors } from '../io.js';

import { fixSentence, formatCheckGithub } from './github.js';
import { formatCheckJson, siteJson } from './json.js';
import { formatCheckMarkdown } from './markdown.js';
import { formatCheckText, formatHowToFix, formatScanText } from './text.js';
import type { CheckOutcome } from './types.js';

const site: ImportSite = {
  id: 'forms|src/a.ts|import|redux-form',
  groupId: 'forms',
  filePath: 'src/a.ts',
  packageName: 'redux-form',
  moduleSpecifier: 'redux-form',
  importKind: 'import',
  kinds: ['dynamic-import', 'import'],
  typeOnly: false,
  sourceFingerprint: '0000000000000000',
};

const violation: Violation = {
  site,
  reason: 'new-site',
  severity: 'error',
  message: 'New import of "redux-form" is not allowed.',
  replacements: [],
};

const result: CheckResult = {
  violations: [violation],
  retired: [],
  existing: [],
  suppressed: [],
  appliedExceptions: [],
  expiredExceptions: [],
  groups: [{ groupId: 'forms', mode: 'ratchet', remaining: 1, retired: 0, newSites: 1 }],
  failed: true,
};

const outcome: CheckOutcome = { result, sites: [site], warnings: [], fileCount: 1, failed: true };
const c = createColors(false);

describe('formatters with unlocated sites', () => {
  it('github falls back to a file-level annotation', () => {
    expect(formatCheckGithub(outcome, { prefix: '', baselinePath: '.migrations/baseline.json' }).split('\n')[0]).toBe(
      '::error file=src/a.ts,title=migration-tracker/forms::New import of "redux-form" is not allowed. Fix: remove the import, or if this import must stay add "// migration-tracker-disable-next-line forms -- <why this import must stay>" above this line. See the job summary for exceptions.',
    );
  });

  it('text prints the file without a line', () => {
    expect(formatCheckText(outcome, c, true)).toBe('✖ forms: src/a.ts\n  New import of "redux-form" is not allowed.\n');
    expect(formatScanText({ version: 1, groups: {} }, [], 0, [], c)).toBe('Scanned 0 files: 0 legacy sites.\n');
    const config = {
      version: 1 as const,
      groups: {
        forms: {
          old: ['redux-form'],
          new: [],
          enforcement: { mode: 'ratchet' as const, scope: 'imports' as const, severity: 'error' as const },
        },
      },
    };
    expect(formatScanText(config, [site], 1, [], c)).toContain('\n  src/a.ts  redux-form  (import (dynamic-import, import))\n');
    expect(formatScanText(config, [{ ...site, kinds: ['import'] }], 1, [], c)).toContain('\n  src/a.ts  redux-form  (import)\n');
  });

  it('markdown links the file without an anchor', () => {
    expect(formatCheckMarkdown(outcome)).toContain('- ✖ **forms**: [src/a.ts](src/a.ts) — New import');
  });

  it('json omits line and column and includes kinds', () => {
    const json = JSON.parse(formatCheckJson(outcome)) as { schemaVersion: number; violations: Array<Record<string, unknown>> };
    expect(json.schemaVersion).toBe(2);
    expect(json.violations[0]).not.toHaveProperty('line');
    expect(json.violations[0]).not.toHaveProperty('column');
    expect(json.violations[0]).toMatchObject({ kinds: ['dynamic-import', 'import'] });
    expect(json.violations[0]).not.toHaveProperty('occurrences');
    expect(siteJson(site)).toMatchObject({ kinds: ['dynamic-import', 'import'] });
    expect(JSON.parse(JSON.stringify(siteJson(site)))).not.toHaveProperty('occurrences');
  });
});

const banned: Violation = {
  site: { ...site, id: 'http|src/b.ts|import|request', groupId: 'http', filePath: 'src/b.ts', packageName: 'request', moduleSpecifier: 'request', line: 3 },
  reason: 'banned',
  severity: 'error',
  message: 'Import of "request" is banned.',
  replacements: [],
};

const replaceable: Violation = {
  site: { ...site, id: 'forms|src/c.ts|import|redux-form', filePath: 'src/c.ts', line: 4, column: 1 },
  reason: 'new-site',
  severity: 'error',
  message: 'New import of "redux-form" is not allowed.',
  replacements: ['react-hook-form', 'formik'],
};

const clean: CheckOutcome = {
  result: { ...result, violations: [], failed: false, groups: [{ groupId: 'forms', mode: 'ratchet', remaining: 1, retired: 0, newSites: 0 }] },
  sites: [site],
  warnings: [],
  fileCount: 1,
  failed: false,
};

function withViolations(violations: Violation[]): CheckOutcome {
  return { ...outcome, result: { ...result, violations } };
}

const expiredOutcome: CheckOutcome = {
  ...clean,
  result: {
    ...clean.result,
    expiredExceptions: [
      { index: 0, exception: { groupId: 'forms', files: ['src/legacy/**'], reason: 'Frozen module.', owner: '@platform', expires: '2001-02-03' } },
    ],
    failed: true,
  },
  failed: true,
};

const additionsOutcome: CheckOutcome = {
  ...clean,
  baselineAdditions: ['forms|src/q.ts|import|redux-form', 'forms|src/r.ts|import|redux-form'],
  failed: true,
};

const githubPaths = { prefix: '', baselinePath: '.migrations/baseline.json', configPath: 'migrations.json' };

describe('how to fix: text', () => {
  it('prints the section once, between the violations and the summary', () => {
    expect(formatCheckText(withViolations([replaceable, violation]), c, false)).toBe(
      [
        '✖ forms: src/c.ts:4',
        '  New import of "redux-form" is not allowed.',
        '  Preferred replacements: "react-hook-form", "formik"',
        '',
        '✖ forms: src/a.ts',
        '  New import of "redux-form" is not allowed.',
        '',
        'How to fix',
        '  1. Use the replacement listed above (preferred).',
        '  2. If an import must stay, add this comment on the line above it, with a real reason:',
        '       // migration-tracker-disable-next-line forms -- <why this import must stay>',
        '  3. For several files or a temporary period, add an entry to "exceptions" in migrations.json:',
        '       {',
        '         "exceptions": [',
        '           {',
        '             "groupId": "forms",',
        '             "files": [',
        '               "src/a.ts",',
        '               "src/c.ts"',
        '             ],',
        '             "reason": "<why this import must stay>",',
        '             "owner": "<team>",',
        '             "expires": "<YYYY-MM-DD>"',
        '           }',
        '         ]',
        '       }',
        "  4. Don't add entries to .migrations/baseline.json by hand; CI rejects baseline additions.",
        '',
        'Legacy sites: 1 remaining | 0 retired | 2 new violations',
        '',
      ].join('\n'),
    );
  });

  it('lists one comment per group and tells banned-only runs to remove the import', () => {
    const banOnly = formatHowToFix([banned], c);
    expect(banOnly.split('\n')[1]).toBe('  1. Remove the import; this package is banned.');
    const mixed = formatHowToFix([banned, replaceable], c).split('\n');
    expect(mixed.slice(1, 5)).toEqual([
      '  1. Use the replacement listed above (preferred), and remove imports of banned packages.',
      '  2. If an import must stay, add the comment for its group on the line above it, with a real reason:',
      '       // migration-tracker-disable-next-line forms -- <why this import must stay>',
      '       // migration-tracker-disable-next-line http -- <why this import must stay>',
    ]);
    expect(formatHowToFix([violation], c).split('\n')[1]).toBe('  1. Remove the import (preferred).');
  });

  it('uses the configured config path', () => {
    const text = formatCheckText(withViolations([violation]), c, false, { config: 'config/migrations.json', baseline: '.migrations/baseline.json' });
    expect(text).toContain('  3. For several files or a temporary period, add an entry to "exceptions" in config/migrations.json:\n');
  });

  it('is absent on clean runs and in quiet mode', () => {
    expect(formatCheckText(clean, c, false)).toBe('Legacy sites: 1 remaining | 0 retired | 0 new violations\n');
    expect(formatCheckText(outcome, c, true)).not.toContain('How to fix');
  });

  it('colors the section when colors are enabled', () => {
    const colored = formatHowToFix([violation], createColors(true));
    expect(colored).toContain('\u001b[1mHow to fix\u001b[22m');
    expect(colored).toContain('\u001b[36m// migration-tracker-disable-next-line forms -- <why this import must stay>\u001b[39m');
  });

  it('explains baseline additions and expired exceptions without a how-to-fix section', () => {
    expect(formatCheckText(additionsOutcome, c, true)).toBe(
      [
        '✖ Unauthorized baseline addition: forms|src/q.ts|import|redux-form',
        '✖ Unauthorized baseline addition: forms|src/r.ts|import|redux-form',
        '  Remove these entries from .migrations/baseline.json — the baseline may only shrink. To allow a new import, use a suppression comment or an exceptions entry in migrations.json instead.',
        '',
      ].join('\n'),
    );
    const expired = formatCheckText(expiredOutcome, c, false);
    expect(expired).toContain('  Migrate the files or renew the exception with a new expires date.\n');
    expect(expired).not.toContain('How to fix');
  });
});

describe('how to fix: github', () => {
  it('appends a fix sentence to each annotation and keeps it on one line', () => {
    const lines = formatCheckGithub(withViolations([replaceable, banned]), githubPaths).split('\n');
    expect(lines[0]).toBe(
      '::error file=src/c.ts,line=4,col=1,title=migration-tracker/forms::New import of "redux-form" is not allowed. Preferred replacements: "react-hook-form", "formik" Fix: use "react-hook-form" or "formik", or if this import must stay add "// migration-tracker-disable-next-line forms -- <why this import must stay>" above this line. See the job summary for exceptions.',
    );
    expect(lines[1]).toBe(
      '::error file=src/b.ts,line=3,title=migration-tracker/http::Import of "request" is banned. Fix: remove the import, or if this import must stay add "// migration-tracker-disable-next-line http -- <why this import must stay>" above this line. See the job summary for exceptions.',
    );
    expect(lines).toHaveLength(4);
  });

  it('escapes newlines in the message so annotations stay single-line', () => {
    const multi: Violation = { ...replaceable, message: 'line one\nline two', replacements: ['a%b'] };
    const [line = ''] = formatCheckGithub(withViolations([multi]), githubPaths).split('\n');
    expect(line).toContain('line one%0Aline two');
    expect(line).toContain('Fix: use "a%25b", or if this import must stay');
    expect(fixSentence({ ...replaceable, replacements: ['a', 'b', 'c'] })).toContain('Fix: use "a", "b" or "c", or');
  });

  it('adds guidance to baseline additions and expired exceptions', () => {
    const add = formatCheckGithub(additionsOutcome, githubPaths).split('\n')[0];
    expect(add).toBe(
      '::error file=.migrations/baseline.json,title=migration-tracker/baseline::Unauthorized baseline addition: forms|src/q.ts|import|redux-form. Remove this entry from .migrations/baseline.json — the baseline may only shrink. To allow a new import, use a suppression comment or an exceptions entry in migrations.json instead.',
    );
    expect(formatCheckGithub(expiredOutcome, githubPaths).split('\n')[0]).toBe(
      '::error file=migrations.json,title=migration-tracker/forms::Exception exceptions[0] for "forms" expired on 2001-02-03 (owner @platform): Frozen module. Migrate the files or renew the exception with a new expires date.',
    );
  });
});

describe('how to fix: markdown', () => {
  it('adds a section with code blocks after the violations', () => {
    const md = formatCheckMarkdown(withViolations([banned, replaceable]));
    const section = md.slice(md.indexOf('### How to fix'));
    expect(section).toBe(
      [
        '### How to fix',
        '',
        '1. Use the replacement listed above (preferred), and remove imports of banned packages.',
        '2. If an import must stay, add the comment for its group on the line above it, with a real reason:',
        '',
        '   ```ts',
        '   // migration-tracker-disable-next-line forms -- <why this import must stay>',
        '   // migration-tracker-disable-next-line http -- <why this import must stay>',
        '   ```',
        '',
        '3. For several files or a temporary period, add an entry to `"exceptions"` in `migrations.json`:',
        '',
        '   ```json',
        '   {',
        '     "exceptions": [',
        '       {',
        '         "groupId": "forms",',
        '         "files": [',
        '           "src/c.ts"',
        '         ],',
        '         "reason": "<why this import must stay>",',
        '         "owner": "<team>",',
        '         "expires": "<YYYY-MM-DD>"',
        '       },',
        '       {',
        '         "groupId": "http",',
        '         "files": [',
        '           "src/b.ts"',
        '         ],',
        '         "reason": "<why this import must stay>",',
        '         "owner": "<team>",',
        '         "expires": "<YYYY-MM-DD>"',
        '       }',
        '     ]',
        '   }',
        '   ```',
        '',
        "4. Don't add entries to `.migrations/baseline.json` by hand; CI rejects baseline additions.",
        '',
      ].join('\n'),
    );
  });

  it('omits the section on clean runs and explains baseline additions and expiry', () => {
    expect(formatCheckMarkdown(clean)).not.toContain('How to fix');
    const add = formatCheckMarkdown(additionsOutcome);
    expect(add).toContain(
      [
        '### Unauthorized baseline additions',
        '',
        'These allowances were added:',
        '',
        '- `forms|src/q.ts|import|redux-form`',
        '- `forms|src/r.ts|import|redux-form`',
        '',
        'Remove these entries from `.migrations/baseline.json` — the baseline may only shrink. To allow a new import, use a suppression comment or an exceptions entry in `migrations.json` instead.',
      ].join('\n'),
    );
    expect(add).not.toContain('How to fix');
    expect(formatCheckMarkdown(expiredOutcome)).toContain(
      '(`src/legacy/**`, owner @platform): Frozen module.\n\nMigrate the files or renew the exception with a new expires date.\n',
    );
  });
});

describe('how to fix: json', () => {
  it('adds remediation as the last key of each violation', () => {
    const json = JSON.parse(formatCheckJson(withViolations([banned]))) as { violations: Array<Record<string, unknown>> };
    const v = json.violations[0] ?? {};
    expect(Object.keys(v).at(-1)).toBe('remediation');
    expect(v.remediation).toEqual({
      replacements: [],
      suppressionComment: '// migration-tracker-disable-next-line http -- <why this import must stay>',
      exception: { groupId: 'http', files: ['src/b.ts'], reason: '<why this import must stay>', owner: '<team>', expires: '<YYYY-MM-DD>' },
    });
  });
});
