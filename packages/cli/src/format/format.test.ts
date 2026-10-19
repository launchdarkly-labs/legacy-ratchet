import type { CheckResult, ImportSite, Violation } from '@legacy-ratchet/core';
import { describe, expect, it } from 'vitest';

import { createColors } from '../io.js';

import { formatCheckGithub } from './github.js';
import { formatCheckJson, siteJson } from './json.js';
import { formatCheckMarkdown } from './markdown.js';
import { formatCheckText, formatScanText } from './text.js';
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
    expect(formatCheckGithub(outcome, { prefix: '', baselinePath: '.legacy/baseline.json' }).split('\n')[0]).toBe(
      '::error file=src/a.ts,title=legacy-ratchet/forms::New import of "redux-form" is not allowed.',
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
