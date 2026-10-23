import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FORMS_DATES_CONFIG, TempRepo } from './__fixtures__/harness.js';
import { reportCommand } from './commands/report.js';
import { CLI_VERSION } from './version.js';

let repo: TempRepo;

beforeEach(() => {
  repo = new TempRepo();
});

afterEach(() => {
  repo.cleanup();
});

const ESC = String.fromCharCode(27);

function setupBaselined(config: unknown = FORMS_DATES_CONFIG): string {
  repo.writeJson('migrations.json', config);
  repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\nimport moment from 'moment';\n");
  repo.commit('initial');
  return repo.commit('noop');
}

describe('global behaviour', () => {
  it('prints the version', async () => {
    const r = await repo.run(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(CLI_VERSION);
    expect(CLI_VERSION).toBe('0.1.0');
  });

  it('maps parse errors to exit 2', async () => {
    expect((await repo.run(['nope'])).code).toBe(2);
    const r = await repo.run(['check', '--bogus']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("unknown option '--bogus'");
    expect((await repo.run(['baseline', 'verify'])).code).toBe(2);
  });

  it('accepts global options after the subcommand', async () => {
    const app = 'packages/app';
    repo.writeJson(`${app}/migrations.json`, FORMS_DATES_CONFIG);
    repo.write(`${app}/src/a.ts`, "import { reduxForm } from 'redux-form';\n");
    const create = await repo.run(['baseline', 'create', '--root', app, '--quiet']);
    expect(create).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(repo.exists(`${app}/.migrations/baseline.json`)).toBe(true);
    const check = await repo.run(['check', '--root', app, '--format', 'json', '--no-color']);
    expect(check.code).toBe(0);
    const other = await repo.run(['scan', '--config', `${app}/migrations.json`, '--root', app, '--format', 'json']);
    expect(JSON.parse(other.stdout).sites).toHaveLength(1);
  });

  it('resolves --config against cwd and reports a missing config', async () => {
    const r = await repo.run(['validate']);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe('error: No config found at migrations.json. Run "migration-tracker init" to create one.\n');
    repo.writeJson('conf/custom.json', FORMS_DATES_CONFIG);
    expect((await repo.run(['validate', '--config', 'custom.json'], { cwd: repo.path('conf') })).code).toBe(0);
  });

  it('prints the stack only with MIGRATION_TRACKER_DEBUG=1', async () => {
    const plain = await repo.run(['validate']);
    expect(plain.stderr.split('\n').filter(Boolean)).toHaveLength(1);
    const debug = await repo.run(['validate'], { env: { MIGRATION_TRACKER_DEBUG: '1' } });
    expect(debug.stderr).toContain('CliError');
  });
});

describe('init', () => {
  it('refuses to overwrite without --force', async () => {
    expect((await repo.run(['init'])).code).toBe(0);
    const again = await repo.run(['init']);
    expect(again.code).toBe(2);
    expect(again.stderr).toContain('already exists');
    expect((await repo.run(['init', '--force'])).code).toBe(0);
  });

  it('hints lodash without putting candidates in the file', async () => {
    repo.writeJson('package.json', { devDependencies: { lodash: '4', tslint: '6' } });
    const r = await repo.run(['init']);
    expect(r.stdout).toContain('hint: "lodash"');
    expect(r.stdout).toContain('"tslint"');
    expect(repo.read('migrations.json')).not.toContain('tslint');
    expect(repo.read('migrations.json').endsWith('}\n')).toBe(true);
  });
});

describe('validate', () => {
  it('prints issues as path: message and exits 2', async () => {
    repo.writeJson('migrations.json', { version: 2, groups: { Bad: { old: [], new: [] } } });
    const r = await repo.run(['validate']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('✖ migrations.json is invalid:');
    expect(r.stderr).toMatch(/^version: .+$/m);
    expect(r.stderr).toMatch(/^groups\.Bad.*: .+$/m);
  });

  it('reports JSON syntax errors at (root)', async () => {
    repo.write('migrations.json', '{ nope');
    const r = await repo.run(['validate']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^\(root\): /m);
  });

  it('makes other commands exit 2 on invalid config', async () => {
    repo.writeJson('migrations.json', { version: 1, groups: {} });
    const r = await repo.run(['check']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Invalid config migrations.json');
  });
});

describe('scan', () => {
  it('prints JSON with stable shape and honours --ignore', async () => {
    setupBaselined();
    repo.write('vendor/x.ts', "import 'moment';\n");
    const r = await repo.run(['scan', '--format', 'json', '--ignore', 'vendor/**']);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(Object.keys(out)).toEqual(['schemaVersion', 'sites', 'files', 'errors']);
    expect(out.files).toBe(1);
    expect(out.schemaVersion).toBe(2);
    expect(out.sites.map((s: { id: string }) => s.id)).toEqual([
      'dates|src/a.ts|import|moment',
      'forms|src/a.ts|import|redux-form',
    ]);
    expect(Object.keys(out.sites[0])).toEqual([
      'id',
      'groupId',
      'filePath',
      'line',
      'column',
      'packageName',
      'moduleSpecifier',
      'importKind',
      'kinds',
      'typeOnly',
      'occurrences',
      'sourceFingerprint',
    ]);
  });

  it('writes --output files with a trailing newline and exits 0 with sites', async () => {
    setupBaselined();
    const r = await repo.run(['scan', '--output', 'out/scan.txt']);
    expect(r.code).toBe(0);
    const text = repo.read('out/scan.txt');
    expect(text).toContain('forms (ratchet): 1 site');
    expect(text).not.toContain(ESC);
    expect(text.endsWith('.\n')).toBe(true);
  });

  it.skipIf(process.platform === 'win32' || os.userInfo().uid === 0)('surfaces unreadable files as warnings', async () => {
    setupBaselined();
    repo.write('src/locked.ts', "import 'moment';\n");
    expect((await repo.run(['baseline', 'create'])).code).toBe(0);
    chmodSync(repo.path('src/locked.ts'), 0o000);
    try {
      const r = await repo.run(['check', '--engine', 'scanner']);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('⚠ src/locked.ts: could not scan file:');
      const depcruise = await repo.run(['check']);
      expect(depcruise.code).toBe(2);
      expect(depcruise.stderr).toContain('error: dependency-cruiser could not extract imports, so nothing was checked');
      expect(depcruise.stderr).toContain('  src/locked.ts: ');
    } finally {
      chmodSync(repo.path('src/locked.ts'), 0o644);
    }
  });
});

describe('check', () => {
  it('ban mode ignores the baseline', async () => {
    const config = {
      version: 1,
      groups: { forms: { old: ['redux-form'], new: [], enforcement: { mode: 'ban' } } },
    };
    setupBaselined(config);
    expect((await repo.run(['baseline', 'create'])).code).toBe(0);
    const r = await repo.run(['check', '--no-color']);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe(
      [
        '✖ forms: src/a.ts:1',
        '  Import of "redux-form" is banned.',
        '',
        'How to fix',
        '  1. Remove the import; this package is banned.',
        '  2. If an import must stay, add this comment on the line above it, with a real reason:',
        '       // migration-tracker-disable-next-line forms -- <why this import must stay>',
        '  3. For several files or a temporary period, add an entry to "exceptions" in migrations.json:',
        '       {',
        '         "exceptions": [',
        '           {',
        '             "groupId": "forms",',
        '             "files": [',
        '               "src/a.ts"',
        '             ],',
        '             "reason": "<why this import must stay>",',
        '             "owner": "<team>",',
        '             "expires": "<YYYY-MM-DD>"',
        '           }',
        '         ]',
        '       }',
        "  4. Don't add entries to .migrations/baseline.json by hand; CI rejects baseline additions.",
        '',
        'Legacy sites: 1 remaining | 0 retired | 1 new violation',
        '',
      ].join('\n'),
    );
  });

  it('report/ban-only configs do not need a baseline', async () => {
    const config = { version: 1, groups: { dates: { old: ['moment'], new: [] } } };
    setupBaselined(config);
    const r = await repo.run(['check']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('Legacy sites: 1 remaining | 0 retired | 0 new violations\n');
  });

  it('warn severity reports but does not fail', async () => {
    const config = {
      version: 1,
      groups: { forms: { old: ['redux-form'], new: ['a', 'b'], enforcement: { mode: 'ratchet', severity: 'warn' } } },
    };
    setupBaselined(config);
    repo.writeJson('.migrations/baseline.json', {
      schemaVersion: 1,
      configDigest: 'sha256:x',
      scannerVersion: '0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      allowed: [],
    });
    const r = await repo.run(['check', '--no-color']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('⚠ forms: src/a.ts:1\n  New import of "redux-form" is not allowed.\n  Preferred replacements: "a", "b"');
  });

  it('warns about suppressions without a reason', async () => {
    setupBaselined();
    expect((await repo.run(['baseline', 'create'])).code).toBe(0);
    repo.write('src/n.ts', "// migration-tracker-disable-next-line forms\nimport 'redux-form';\n");
    const r = await repo.run(['check', '--no-color']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('⚠ src/n.ts:2: suppression requires a reason after --');
    repo.write('src/n.ts', "// migration-tracker-disable-next-line forms -- migrating in Q3\nimport 'redux-form';\n");
    const ok = await repo.run(['check', '--format', 'json']);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).suppressedCount).toBe(1);
  });

  it('colours text on a TTY and honours --no-color / NO_COLOR', async () => {
    setupBaselined();
    expect((await repo.run(['baseline', 'create'])).code).toBe(0);
    repo.write('src/c.ts', "import 'redux-form';\n");
    expect((await repo.run(['check'], { isTTY: true })).stdout).toContain(ESC);
    expect((await repo.run(['check', '--no-color'], { isTTY: true })).stdout).not.toContain(ESC);
    expect((await repo.run(['check'], { isTTY: true, env: { NO_COLOR: '1' } })).stdout).not.toContain(ESC);
    expect((await repo.run(['check', '--format', 'markdown'], { isTTY: true })).stdout).not.toContain(ESC);
    expect((await repo.run(['check', '--format', 'github'], { isTTY: true })).stdout).not.toContain(ESC);
  });

  it('--quiet prints only violations', async () => {
    setupBaselined();
    expect((await repo.run(['baseline', 'create', '--quiet'])).stdout).toBe('');
    expect((await repo.run(['check', '--quiet'])).stdout).toBe('');
    repo.write('src/c.ts', "import 'redux-form';\n");
    const r = await repo.run(['check', '--quiet', '--no-color']);
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain('Legacy sites:');
    expect(r.stdout).toContain('✖ forms: src/c.ts:1');
  });

  it('rejects unknown formats', async () => {
    setupBaselined();
    expect((await repo.run(['check', '--format', 'xml'])).code).toBe(2);
  });

  it('fails cleanly on an unknown --changed-since ref', async () => {
    setupBaselined();
    expect((await repo.run(['baseline', 'create'])).code).toBe(0);
    const r = await repo.run(['check', '--changed-since', 'does-not-exist']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Unknown git ref "does-not-exist"');
  });
});

describe('check formats', () => {
  async function prepare(): Promise<string> {
    setupBaselined();
    expect((await repo.run(['baseline', 'create'])).code).toBe(0);
    const base = repo.commit('baseline');
    repo.write('src/a.ts', "import moment from 'moment';\n");
    repo.write('src/c.ts', "export {};\nimport { Field } from 'redux-form';\n");
    return base;
  }

  it('json', async () => {
    await prepare();
    const r = await repo.run(['check', '--format', 'json']);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout)).toEqual({
      schemaVersion: 2,
      failed: true,
      groups: [
        { groupId: 'forms', mode: 'ratchet', remaining: 1, retired: 1, newSites: 1 },
        { groupId: 'dates', mode: 'report', remaining: 1, retired: 0, newSites: 0 },
      ],
      violations: [
        {
          groupId: 'forms',
          filePath: 'src/c.ts',
          line: 2,
          column: 23,
          moduleSpecifier: 'redux-form',
          importKind: 'import',
          kinds: ['import'],
          occurrences: 1,
          reason: 'new-site',
          severity: 'error',
          message: 'New import of "redux-form" is not allowed.',
          replacements: ['react-hook-form'],
          docs: 'https://example.com/forms',
          remediation: {
            replacements: ['react-hook-form'],
            suppressionComment: '// migration-tracker-disable-next-line forms -- <why this import must stay>',
            exception: {
              groupId: 'forms',
              files: ['src/c.ts'],
              reason: '<why this import must stay>',
              owner: '<team>',
              expires: '<YYYY-MM-DD>',
            },
          },
        },
      ],
      retired: ['forms|src/a.ts|import|redux-form'],
      expiredExceptions: [],
      suppressedCount: 0,
      exceptedCount: 0,
    });
    expect(Object.keys(JSON.parse(r.stdout))).toEqual([
      'schemaVersion',
      'failed',
      'groups',
      'violations',
      'retired',
      'expiredExceptions',
      'suppressedCount',
      'exceptedCount',
    ]);
  });

  it('markdown', async () => {
    await prepare();
    const r = await repo.run(['check', '--format', 'markdown']);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe(
      [
        '## migration-tracker',
        '',
        '**✖ Check failed.** Legacy sites: 2 remaining | 1 retired | 1 new violation',
        '',
        '| Group | Mode | Remaining | Retired | New |',
        '| --- | --- | ---: | ---: | ---: |',
        '| forms | ratchet | 1 | 1 | 1 |',
        '| dates | report | 1 | 0 | 0 |',
        '',
        '### New violation',
        '',
        '- ✖ **forms**: [src/c.ts:2](src/c.ts#L2) — New import of "redux-form" is not allowed. Preferred replacement: "react-hook-form". [Migration guide](https://example.com/forms)',
        '',
        '### How to fix',
        '',
        '1. Use the replacement listed above (preferred).',
        '2. If an import must stay, add this comment on the line above it, with a real reason:',
        '',
        '   ```ts',
        '   // migration-tracker-disable-next-line forms -- <why this import must stay>',
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
        '       }',
        '     ]',
        '   }',
        '   ```',
        '',
        "4. Don't add entries to `.migrations/baseline.json` by hand; CI rejects baseline additions.",
        '',
        '🎉 1 legacy site retired. Run `migration-tracker baseline update` and commit `.migrations/baseline.json` to lock in the progress.',
        '',
      ].join('\n'),
    );
  });

  it('github annotations and step summary', async () => {
    await prepare();
    const summary = repo.path('summary.md');
    writeFileSync(summary, '# previous step\n');
    const r = await repo.run(['check', '--format', 'github'], { env: { GITHUB_STEP_SUMMARY: summary } });
    expect(r.code).toBe(1);
    expect(r.stdout).toBe(
      [
        '::error file=src/c.ts,line=2,col=23,title=migration-tracker/forms::New import of "redux-form" is not allowed. Preferred replacement: "react-hook-form" Migration guide: https://example.com/forms Fix: use "react-hook-form", or if this import must stay add "// migration-tracker-disable-next-line forms -- <why this import must stay>" above this line. See the job summary for exceptions.',
        'Legacy sites: 2 remaining | 1 retired | 1 new violation',
        '',
      ].join('\n'),
    );
    const written = readFileSync(summary, 'utf8');
    expect(written.startsWith('# previous step\n## migration-tracker\n')).toBe(true);
    expect(written).toContain('| forms | ratchet | 1 | 1 | 1 |');
    expect(written).toContain('### How to fix\n');
    expect(written).toContain('   // migration-tracker-disable-next-line forms -- <why this import must stay>\n');
    expect(written).toContain('   ```json\n');
    expect(written.endsWith('\n')).toBe(true);
  });

  it('github warnings, expired exceptions and baseline additions', async () => {
    const base = await prepare();
    repo.remove('src/c.ts');
    repo.write('src/w.ts', "// migration-tracker-disable-line\nimport 'moment'; // migration-tracker-disable-line\n");
    const config = {
      ...FORMS_DATES_CONFIG,
      exceptions: [{ groupId: 'forms', files: ['x/**'], reason: 'r', owner: '@o', expires: '2001-02-03' }],
    };
    repo.writeJson('migrations.json', config);
    const b = JSON.parse(repo.read('.migrations/baseline.json'));
    b.allowed = [...b.allowed, 'forms|src/q.ts|import|redux-form'].sort();
    repo.writeJson('.migrations/baseline.json', b);
    const r = await repo.run(['check', '--format', 'github', '--base', base]);
    expect(r.code).toBe(1);
    expect(r.stdout.split('\n')).toEqual([
      '::error file=migrations.json,title=migration-tracker/forms::Exception exceptions[0] for "forms" expired on 2001-02-03 (owner @o): r. Migrate the files or renew the exception with a new expires date.',
      '::error file=.migrations/baseline.json,title=migration-tracker/baseline::Unauthorized baseline addition: forms|src/q.ts|import|redux-form. Remove this entry from .migrations/baseline.json — the baseline may only shrink. To allow a new import, use a suppression comment or an exceptions entry in migrations.json instead.',
      '::warning file=src/w.ts,line=2,col=8,title=migration-tracker::suppression requires a reason after --',
      'Legacy sites: 2 remaining | 2 retired | 0 new violations',
      '',
    ]);
  });
});

describe('subdirectory root', () => {
  it('handles --base, --changed-since and github paths relative to the repo', async () => {
    const app = 'packages/app';
    repo.writeJson(`${app}/migrations.json`, FORMS_DATES_CONFIG);
    repo.write(`${app}/src/a.ts`, "import { reduxForm } from 'redux-form';\n");
    repo.write('outside/z.ts', "import { reduxForm } from 'redux-form';\n");
    expect((await repo.run(['baseline', 'create', '--root', app])).code).toBe(0);
    const base = repo.commit('baseline');

    const verify = await repo.run(['baseline', 'verify', '--root', app, '--base', base]);
    expect(verify.code).toBe(0);
    expect(verify.stdout).toContain('adds no allowances');

    repo.write(`${app}/src/new.ts`, "import 'redux-form';\n");
    repo.write('outside/y.ts', "import 'redux-form';\n");
    const changed = await repo.run(['check', '--root', app, '--changed-since', base, '--format', 'github']);
    expect(changed.code).toBe(1);
    expect(changed.stdout).toContain('::error file=packages/app/src/new.ts,line=1,col=8,title=migration-tracker/forms::');
    expect(changed.stdout).toContain('Legacy sites: 1 remaining | 0 retired | 1 new violation');

    const fromInside = await repo.run(['check', '--changed-since', base, '--format', 'json'], { cwd: repo.path(app) });
    expect(JSON.parse(fromInside.stdout).violations.map((v: { filePath: string }) => v.filePath)).toEqual(['src/new.ts']);

    repo.remove(`${app}/src/new.ts`);
    const b = JSON.parse(repo.read(`${app}/.migrations/baseline.json`));
    b.allowed = [...b.allowed, 'forms|src/q.ts|import|redux-form'].sort();
    repo.writeJson(`${app}/.migrations/baseline.json`, b);
    const tampered = await repo.run(['check', '--root', app, '--base', base]);
    expect(tampered.code).toBe(1);
    expect(tampered.stdout).toContain('Unauthorized baseline addition: forms|src/q.ts|import|redux-form');
  });

  it('treats a missing baseline at the base ref as first adoption', async () => {
    setupBaselined();
    const base = repo.commit('before adoption');
    expect((await repo.run(['baseline', 'create'])).code).toBe(0);
    const r = await repo.run(['baseline', 'verify', '--base', base]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('first adoption');
    const c = await repo.run(['check', '--base', base, '--format', 'json']);
    expect(c.code).toBe(0);
    expect(c.stderr).toContain('first adoption');
    expect(JSON.parse(c.stdout).baselineAdditions).toEqual([]);
  });

  it('baseline update and verify require a baseline', async () => {
    setupBaselined();
    const u = await repo.run(['baseline', 'update']);
    expect(u.code).toBe(2);
    expect(u.stderr).toContain('migration-tracker baseline create');
    expect((await repo.run(['baseline', 'verify', '--base', 'HEAD'])).code).toBe(2);
  });
});

describe('baseline migrate', () => {
  function writeV1(allowed: string[]): void {
    repo.writeJson('.migrations/baseline.json', {
      schemaVersion: 1,
      configDigest: 'sha256:x',
      scannerVersion: '0.1.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      allowed,
    });
  }

  it('upgrades a v1 baseline, reconciling import-equals and never adding new pairs', async () => {
    repo.writeJson('migrations.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\nimport { Field } from 'redux-form';\nimport moment from 'moment';\n");
    repo.write('src/eq.ts', "import forms = require('redux-form');\n");
    writeV1([
      'forms|src/a.ts|import|redux-form|0',
      'forms|src/a.ts|import|redux-form|1',
      'forms|src/eq.ts|import|redux-form|0',
      'dates|src/gone.ts|import|moment|0',
    ]);
    const base = repo.commit('v1 baseline');

    const legacyCheck = await repo.run(['check', '--no-color']);
    expect(legacyCheck.code).toBe(0);
    expect(legacyCheck.stderr.match(/migration-tracker baseline migrate/g)).toHaveLength(1);

    const r = await repo.run(['baseline', 'migrate', '--no-color']);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe(
      [
        'Migrated .migrations/baseline.json to schemaVersion 2: 3 mapped sites, 1 reconciled-added, 2 dropped (2 allowed).',
        '  + forms|src/eq.ts|require|redux-form',
        '  - dates|src/gone.ts|import|moment',
        '  - forms|src/eq.ts|import|redux-form',
        '',
      ].join('\n'),
    );
    const written = JSON.parse(repo.read('.migrations/baseline.json'));
    expect(written.schemaVersion).toBe(2);
    expect(written).not.toHaveProperty('upgradedFrom');
    expect(written.allowed).toEqual(['forms|src/a.ts|import|redux-form', 'forms|src/eq.ts|require|redux-form']);

    const check = await repo.run(['check']);
    expect(check.code).toBe(0);
    expect(check.stderr).toBe('');
    const verify = await repo.run(['baseline', 'verify', '--base', base]);
    expect(verify.code).toBe(0);
    expect(verify.stdout).toContain('adds no allowances');

    const again = await repo.run(['baseline', 'migrate']);
    expect(again.code).toBe(2);
    expect(again.stderr).toContain('already schemaVersion 2');
  });

  it('requires an existing baseline', async () => {
    setupBaselined();
    const r = await repo.run(['baseline', 'migrate']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('No baseline found at .migrations/baseline.json');
  });
});

describe('report', () => {
  it('tolerates blank and malformed history lines', async () => {
    setupBaselined();
    repo.write(
      '.migrations/history.jsonl',
      [
        JSON.stringify({ generatedAt: '2026-01-01T00:00:00.000Z', totals: { forms: 3 } }),
        '',
        '{not json',
        JSON.stringify({ totals: {} }),
        JSON.stringify({ generatedAt: '2026-02-01T00:00:00.000Z', totals: { forms: 2 } }),
      ].join('\n'),
    );
    const r = await repo.run(['report', '--format', 'json', '--append-history']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('history.jsonl:3: skipping malformed history entry');
    expect(r.stderr).toContain('history.jsonl:4: skipping malformed history entry');
    const snapshot = JSON.parse(r.stdout);
    expect(snapshot.history.map((h: { totals: Record<string, number> }) => h.totals.forms)).toEqual([3, 2, 1]);
    const lines = repo.read('.migrations/history.jsonl').split('\n');
    expect(lines.at(-1)).toBe('');
    expect(JSON.parse(lines.at(-2)!).totals).toEqual({ forms: 1, dates: 1 });
    expect(JSON.parse(lines.at(-2)!).revision.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('reports adoption, CODEOWNERS owners and the source url template in JSON', async () => {
    for (const engine of ['depcruise', 'scanner']) {
      setupBaselined();
      repo.write('src/b.ts', "import { useForm } from 'react-hook-form';\nimport dayjs from 'dayjs';\nimport { format } from 'date-fns';\n");
      repo.write('lib/c.ts', "import { reduxForm } from 'redux-form';\n");
      repo.write('.github/CODEOWNERS', '# owners\n*.ts @acme/all\n/src/ @acme/web # web team\n/lib/c.ts\n');
      const template = 'https://example.com/acme/repo/blob/{sha}/{path}#L{line}';
      const r = await repo.run(['report', '--format', 'json', '--engine', engine, '--source-url', template]);
      expect(r.code).toBe(0);
      const snapshot = JSON.parse(r.stdout);
      expect(snapshot.sourceUrlTemplate).toBe(template);
      expect(snapshot.totals).toEqual({ sites: 3, start: 3, completePct: 0, newSites: 3, adoptionPct: 50 });
      const forms = snapshot.groups.find((g: { id: string }) => g.id === 'forms');
      const dates = snapshot.groups.find((g: { id: string }) => g.id === 'dates');
      expect(forms).toMatchObject({
        sites: 2,
        newSites: 1,
        adoptionPct: 33.3,
        byOwner: { '@acme/web': 1, Unowned: 1 },
        byDirectory: { lib: 1, src: 1 },
        startHere: [
          { filePath: 'lib/c.ts', count: 1 },
          { filePath: 'src/a.ts', count: 1 },
        ],
      });
      expect(dates).toMatchObject({ sites: 1, newSites: 2, adoptionPct: 66.7, byOwner: { '@acme/web': 1 } });
      expect(snapshot.sites.map((s: { id: string; owners?: string[] }) => [s.id, s.owners ?? null])).toEqual([
        ['dates|src/a.ts|import|moment', ['@acme/web']],
        ['forms|lib/c.ts|import|redux-form', null],
        ['forms|src/a.ts|import|redux-form', ['@acme/web']],
      ]);
      repo.cleanup();
      repo = new TempRepo();
    }
  });

  it('reads CODEOWNERS from an explicit path, can skip it, and fails on a missing explicit path', async () => {
    setupBaselined();
    repo.write('CODEOWNERS', '* @acme/root\n');
    repo.write('owners/TEAM', '/src/ @acme/explicit\n');
    const byOwner = (stdout: string) => JSON.parse(stdout).groups[0].byOwner;
    const auto = await repo.run(['report', '--format', 'json']);
    expect(byOwner(auto.stdout)).toEqual({ '@acme/root': 1 });
    const explicit = await repo.run(['report', '--format', 'json', '--codeowners', 'owners/TEAM']);
    expect(byOwner(explicit.stdout)).toEqual({ '@acme/explicit': 1 });
    const none = await repo.run(['report', '--format', 'json', '--no-codeowners']);
    expect(byOwner(none.stdout)).toEqual({ Unowned: 1 });
    expect(JSON.parse(none.stdout).sites[0]).not.toHaveProperty('owners');
    const missing = await repo.run(['report', '--format', 'json', '--codeowners', 'nope/CODEOWNERS']);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('No CODEOWNERS file found at nope/CODEOWNERS');
  });

  it('works without any CODEOWNERS file', async () => {
    setupBaselined();
    const r = await repo.run(['report', '--format', 'json']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).groups[0].byOwner).toEqual({ Unowned: 1 });
  });

  it('reads and appends a --history file instead of .migrations/history.jsonl', async () => {
    setupBaselined();
    repo.write('.migrations/history.jsonl', `${JSON.stringify({ generatedAt: '2026-01-01T00:00:00.000Z', totals: { forms: 50 } })}\n`);
    repo.write('data/h.jsonl', `${JSON.stringify({ generatedAt: '2026-01-01T00:00:00.000Z', totals: { forms: 4 } })}\n`);
    repo.write('src/n.ts', "import { useForm } from 'react-hook-form';\n");
    const r = await repo.run(['report', '--format', 'json', '--history', 'data/h.jsonl', '--append-history']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Appended history entry to data/h.jsonl');
    const snapshot = JSON.parse(r.stdout);
    expect(snapshot.groups[0]).toMatchObject({ id: 'forms', start: 4, sites: 1, completePct: 75 });
    expect(snapshot.history).toHaveLength(2);
    const lines = repo.read('data/h.jsonl').trim().split('\n');
    expect(lines).toHaveLength(2);
    const appended = JSON.parse(lines[1]!);
    expect(appended.totals).toEqual({ forms: 1, dates: 1 });
    expect(appended.newTotals).toEqual({ forms: 1, dates: 0 });
    expect(repo.read('.migrations/history.jsonl').trim().split('\n')).toHaveLength(1);
  });

  it('renders html with a provided template', async () => {
    setupBaselined();
    let stdout = '';
    const code = await reportCommand(
      { root: repo.dir, output: 'r.html', template: '<html><script id="migration-tracker-data" type="application/json">__MIGRATION_TRACKER_DATA__</script></html>' },
      { stdout: (s) => (stdout += s), stderr: () => {}, cwd: repo.dir, env: {} },
    );
    expect(code).toBe(0);
    const html = repo.read('r.html');
    const json = /<script[^>]*>(.*)<\/script>/.exec(html)![1]!;
    expect(JSON.parse(json).totalSites).toBe(2);
    expect(stdout).toBe('');
  });

  const dashboardDist = fileURLToPath(new URL('../../dashboard/dist/index.html', import.meta.url));
  it.skipIf(!existsSync(dashboardDist))('renders html with the built dashboard to the default path', async () => {
    setupBaselined();
    const r = await repo.run(['report']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Wrote migration-report.html');
    const html = repo.read('migration-report.html');
    expect(html).toContain('migration-tracker-data');
    expect(html).toContain('forms|src/a.ts|import|redux-form');
    expect(html).not.toContain('__MIGRATION_TRACKER_DATA__');
    expect(path.basename(dashboardDist)).toBe('index.html');
  });
});
