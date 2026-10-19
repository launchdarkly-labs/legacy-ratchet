import { describe, expect, it } from 'vitest';

import { config, raw } from './__fixtures__/helpers.js';
import { assignOwners, collectSites, ownersFor, parseCodeowners } from './index.js';

const owners = (text: string, filePath: string) => ownersFor(parseCodeowners(text), filePath);

describe('parseCodeowners', () => {
  it('skips blank lines and comments, strips inline comments, keeps line numbers', () => {
    const rules = parseCodeowners(
      [
        '# comment',
        '',
        '*       @global-owner1 @global-owner2',
        '*.js    @js-owner #This is an inline comment.',
        '/apps/github',
        '\t  ',
      ].join('\n'),
    );
    expect(rules).toEqual([
      { pattern: '*', owners: ['@global-owner1', '@global-owner2'], line: 3 },
      { pattern: '*.js', owners: ['@js-owner'], line: 4 },
      { pattern: '/apps/github', owners: [], line: 5 },
    ]);
  });

  it('handles CRLF line endings and escaped hashes', () => {
    const rules = parseCodeowners('*.go docs@example.com\r\n\\#notes.md @acme/docs # trailing\r\n');
    expect(rules).toEqual([
      { pattern: '*.go', owners: ['docs@example.com'], line: 1 },
      { pattern: '\\#notes.md', owners: ['@acme/docs'], line: 2 },
    ]);
    expect(ownersFor(rules, '#notes.md')).toEqual(['@acme/docs']);
  });
});

describe('ownersFor (documented CODEOWNERS examples)', () => {
  const file = [
    '*       @global-owner1 @global-owner2',
    '*.js    @js-owner #This is an inline comment.',
    '*.go docs@example.com',
    '*.txt @octo-org/octocats',
    '/build/logs/ @doctocat',
    'docs/*  docs@example.com',
    'apps/ @octocat',
    '/docs/ @doctocat',
    '/scripts/ @doctocat @octocat',
    '**/logs @octocat',
    '/apps/ @octocat',
    '/apps/github',
  ].join('\n');
  const rules = parseCodeowners(file);
  const of = (p: string) => ownersFor(rules, p);

  it('falls back to the catch-all rule', () => {
    expect(of('README.md')).toEqual(['@global-owner1', '@global-owner2']);
    expect(of('src/deep/thing.ts')).toEqual(['@global-owner1', '@global-owner2']);
  });

  it('matches extensions at any depth', () => {
    expect(of('src/index.js')).toEqual(['@js-owner']);
    expect(of('cmd/main.go')).toEqual(['docs@example.com']);
    expect(of('notes.txt')).toEqual(['@octo-org/octocats']);
  });

  it('anchored trailing-slash directories cover all descendants', () => {
    expect(ownersFor(parseCodeowners('/build/logs/ @doctocat'), 'build/logs/a.txt')).toEqual(['@doctocat']);
    expect(ownersFor(parseCodeowners('/build/logs/ @doctocat'), 'src/build/logs/a.txt')).toBeUndefined();
    expect(of('build/logs/a.txt')).toEqual(['@octocat']);
    expect(of('build/logs/deep/nested/a.ts')).toEqual(['@octocat']);
    expect(of('scripts/run.sh')).toEqual(['@doctocat', '@octocat']);
  });

  it('docs/* matches direct children only', () => {
    expect(ownersFor(parseCodeowners('docs/*  docs@example.com'), 'docs/getting-started.md')).toEqual([
      'docs@example.com',
    ]);
    expect(ownersFor(parseCodeowners('docs/*  docs@example.com'), 'docs/build-app/troubleshooting.md')).toBeUndefined();
  });

  it('a directory name without a leading slash matches at any depth', () => {
    const r = parseCodeowners('apps/ @octocat');
    expect(ownersFor(r, 'apps/x.ts')).toEqual(['@octocat']);
    expect(ownersFor(r, 'packages/web/apps/x.ts')).toEqual(['@octocat']);
    expect(ownersFor(r, 'apps')).toBeUndefined();
    expect(ownersFor(r, 'myapps/x.ts')).toBeUndefined();
  });

  it('**/logs matches a logs directory anywhere', () => {
    const r = parseCodeowners('**/logs @octocat');
    expect(ownersFor(r, 'build/logs/a.txt')).toEqual(['@octocat']);
    expect(ownersFor(r, 'scripts/logs/a.txt')).toEqual(['@octocat']);
    expect(ownersFor(r, 'deeply/nested/logs/a.txt')).toEqual(['@octocat']);
    expect(ownersFor(r, 'logs/a.txt')).toEqual(['@octocat']);
    expect(ownersFor(r, 'catalogs/a.txt')).toBeUndefined();
  });

  it('a later rule with no owners un-assigns', () => {
    expect(of('apps/web/index.ts')).toEqual(['@octocat']);
    expect(of('apps/github/index.ts')).toBeUndefined();
    expect(of('apps/github')).toBeUndefined();
  });

  it('last matching rule wins', () => {
    expect(owners('*.js @a\n/src/ @b', 'src/x.js')).toEqual(['@b']);
    expect(owners('/src/ @b\n*.js @a', 'src/x.js')).toEqual(['@a']);
  });
});

describe('ownersFor pattern semantics', () => {
  it('anchors patterns with a leading or middle slash', () => {
    expect(owners('/src @a', 'src/x.ts')).toEqual(['@a']);
    expect(owners('/src @a', 'lib/src/x.ts')).toBeUndefined();
    expect(owners('src/app @a', 'src/app/x.ts')).toEqual(['@a']);
    expect(owners('src/app @a', 'lib/src/app/x.ts')).toBeUndefined();
  });

  it('a bare name matches files or directories at any depth', () => {
    expect(owners('Makefile @a', 'tools/Makefile')).toEqual(['@a']);
    expect(owners('fixtures @a', 'pkg/fixtures/x.ts')).toEqual(['@a']);
    expect(owners('fixtures @a', 'pkg/fixtures-old/x.ts')).toBeUndefined();
  });

  it('* does not cross / but ** does', () => {
    expect(owners('/src/*.ts @a', 'src/x.ts')).toEqual(['@a']);
    expect(owners('/src/*.ts @a', 'src/deep/x.ts')).toBeUndefined();
    expect(owners('/src/**/*.ts @a', 'src/deep/er/x.ts')).toEqual(['@a']);
    expect(owners('/src/**/*.ts @a', 'src/x.ts')).toEqual(['@a']);
    expect(owners('/src/** @a', 'src/deep/x.md')).toEqual(['@a']);
    expect(owners('/src/** @a', 'srcx/a.md')).toBeUndefined();
    expect(owners('a?c.ts @a', 'abc.ts')).toEqual(['@a']);
    expect(owners('a?c.ts @a', 'a/c.ts')).toBeUndefined();
  });

  it('escapes regex characters in patterns', () => {
    expect(owners('/src/(group)/[id].ts @a', 'src/(group)/[id].ts')).toEqual(['@a']);
    expect(owners('*.ts @a', 'xts')).toBeUndefined();
  });

  it('normalizes the queried path', () => {
    expect(owners('/src/ @a', './src/x.ts')).toEqual(['@a']);
    expect(owners('/src/ @a', 'src\\x.ts')).toEqual(['@a']);
  });

  it('returns undefined with no rules or no match', () => {
    expect(ownersFor([], 'src/x.ts')).toBeUndefined();
    expect(owners('/lib/ @a', 'src/x.ts')).toBeUndefined();
  });

  it('returns a copy of the owners', () => {
    const rules = parseCodeowners('* @a');
    ownersFor(rules, 'x')!.push('@mutated');
    expect(ownersFor(rules, 'x')).toEqual(['@a']);
  });
});

describe('assignOwners', () => {
  const cfg = config({ version: 1, groups: { forms: { old: ['redux-form'] } } });
  const sites = collectSites(cfg, [
    raw('src/a.ts', 'redux-form', 1),
    raw('lib/b.ts', 'redux-form', 1),
    raw('vendor/c.ts', 'redux-form', 1),
  ]);

  it('sets owners from the last matching rule and leaves unmatched sites without owners', () => {
    const rules = parseCodeowners('/src/ @acme/web\n/lib/ @acme/core @acme/web\n/vendor/ @acme/web\n/vendor/c.ts');
    const assigned = assignOwners(sites, rules);
    expect(assigned.map((s) => [s.filePath, s.owners])).toEqual([
      ['lib/b.ts', ['@acme/core', '@acme/web']],
      ['src/a.ts', ['@acme/web']],
      ['vendor/c.ts', undefined],
    ]);
    expect(assigned[2]).not.toHaveProperty('owners');
    expect(sites[0]).not.toHaveProperty('owners');
  });

  it('drops stale owners when nothing matches', () => {
    const withOwners = sites.map((s) => ({ ...s, owners: ['@old'] }));
    expect(assignOwners(withOwners, []).every((s) => !('owners' in s))).toBe(true);
  });
});
