import { describe, expect, it } from 'vitest';
import { exceptionsSnippet, remediationFor, suppressionComment, validateConfig } from './index.js';
import type { ImportSite, Violation } from './index.js';

function violation(groupId: string, filePath: string, reason: Violation['reason'], replacements: string[] = []): Violation {
  const site: ImportSite = {
    id: `${groupId}|${filePath}|import|pkg`,
    groupId,
    filePath,
    packageName: 'pkg',
    moduleSpecifier: 'pkg',
    importKind: 'import',
    kinds: ['import'],
    typeOnly: false,
    sourceFingerprint: '0000000000000000',
  };
  return { site, reason, severity: 'error', message: 'm', replacements };
}

describe('remediationFor', () => {
  it('builds replacements, a suppression comment and a placeholder exception for a new site', () => {
    const v = violation('forms', 'src/a.ts', 'new-site', ['react-hook-form']);
    const r = remediationFor(v);
    expect(r).toEqual({
      replacements: ['react-hook-form'],
      suppressionComment: '// migration-tracker-disable-next-line forms -- <why this import must stay>',
      exception: {
        groupId: 'forms',
        files: ['src/a.ts'],
        reason: '<why this import must stay>',
        owner: '<team>',
        expires: '<YYYY-MM-DD>',
      },
    });
    expect(Object.keys(r)).toEqual(['replacements', 'suppressionComment', 'exception']);
    r.replacements.push('x');
    expect(v.replacements).toEqual(['react-hook-form']);
  });

  it('builds the same shape for a banned site with no replacements', () => {
    expect(remediationFor(violation('http', 'src/b.ts', 'banned'))).toEqual({
      replacements: [],
      suppressionComment: '// migration-tracker-disable-next-line http -- <why this import must stay>',
      exception: { groupId: 'http', files: ['src/b.ts'], reason: '<why this import must stay>', owner: '<team>', expires: '<YYYY-MM-DD>' },
    });
  });

  it('suppressionComment accepts a custom reason', () => {
    expect(suppressionComment('dates', 'needs isoWeek')).toBe('// migration-tracker-disable-next-line dates -- needs isoWeek');
  });

  it('uses placeholders that fail validation until filled in', () => {
    const { exception } = remediationFor(violation('forms', 'src/a.ts', 'new-site'));
    const result = validateConfig({
      version: 1,
      groups: { forms: { old: ['pkg'], new: [], enforcement: { mode: 'ratchet', scope: 'imports', severity: 'error' } } },
      exceptions: [exception],
    });
    expect(result.ok).toBe(false);
  });
});

describe('exceptionsSnippet', () => {
  it('merges violations into one entry per group with sorted, unique files', () => {
    const snippet = exceptionsSnippet([
      violation('forms', 'src/z.ts', 'new-site'),
      violation('dates', 'src/b.ts', 'new-site'),
      violation('forms', 'src/a.ts', 'new-site'),
      violation('forms', 'src/z.ts', 'new-site'),
      violation('http', 'src/c.ts', 'banned'),
    ]);
    expect(JSON.parse(snippet)).toEqual({
      exceptions: [
        { groupId: 'dates', files: ['src/b.ts'], reason: '<why this import must stay>', owner: '<team>', expires: '<YYYY-MM-DD>' },
        { groupId: 'forms', files: ['src/a.ts', 'src/z.ts'], reason: '<why this import must stay>', owner: '<team>', expires: '<YYYY-MM-DD>' },
        { groupId: 'http', files: ['src/c.ts'], reason: '<why this import must stay>', owner: '<team>', expires: '<YYYY-MM-DD>' },
      ],
    });
  });

  it('is pretty-printed with two-space indentation', () => {
    expect(exceptionsSnippet([violation('forms', 'src/a.ts', 'new-site')])).toBe(
      [
        '{',
        '  "exceptions": [',
        '    {',
        '      "groupId": "forms",',
        '      "files": [',
        '        "src/a.ts"',
        '      ],',
        '      "reason": "<why this import must stay>",',
        '      "owner": "<team>",',
        '      "expires": "<YYYY-MM-DD>"',
        '    }',
        '  ]',
        '}',
      ].join('\n'),
    );
  });

  it('is an empty list when there are no violations', () => {
    expect(exceptionsSnippet([])).toBe('{\n  "exceptions": []\n}');
  });
});
