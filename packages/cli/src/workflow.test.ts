import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FORMS_DATES_CONFIG, TempRepo } from './__fixtures__/harness.js';

let repo: TempRepo;

beforeEach(() => {
  repo = new TempRepo();
});

afterEach(() => {
  repo.cleanup();
});

function baselineAllowed(): string[] {
  return (JSON.parse(repo.read('.migrations/baseline.json')) as { allowed: string[] }).allowed;
}

describe('full workflow', () => {
  it('init -> baseline -> ratchet -> retire -> update -> verify -> exceptions -> changed-since -> report', async () => {
    repo.writeJson('package.json', { name: 'app', dependencies: { moment: '^2', react: '^19' } });

    const init = await repo.run(['init']);
    expect(init.code).toBe(0);
    expect(init.stdout).toContain('"moment"');
    expect(repo.exists('migrations.json')).toBe(true);
    expect(repo.read('.migrations/README.md')).toContain('migration-tracker baseline create');
    expect(JSON.parse(repo.read('migrations.json')).$schema).toBe('./node_modules/@migration-tracker/core/schema.json');
    expect((await repo.run(['validate'])).code).toBe(0);

    repo.writeJson('migrations.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\nimport moment from 'moment';\n");
    repo.write('src/b.ts', "import { Field } from 'redux-form';\nexport const x = 1;\n");
    repo.commit('initial');

    const noBaseline = await repo.run(['check']);
    expect(noBaseline.code).toBe(2);
    expect(noBaseline.stderr).toContain('migration-tracker baseline create');

    const create = await repo.run(['baseline', 'create']);
    expect(create.code).toBe(0);
    expect(create.stdout).toContain('3 allowed legacy sites');
    expect(baselineAllowed()).toEqual([
      'dates|src/a.ts|import|moment',
      'forms|src/a.ts|import|redux-form',
      'forms|src/b.ts|import|redux-form',
    ]);
    const baseline = JSON.parse(repo.read('.migrations/baseline.json'));
    expect(baseline.revision.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(baseline.revision.branch).toBe('main');
    expect((await repo.run(['baseline', 'create'])).code).toBe(2);
    const baseRef = repo.commit('baseline');

    expect((await repo.run(['check'])).code).toBe(0);

    repo.write('src/c.ts', "import { Field } from 'redux-form';\n");
    const failing = await repo.run(['check', '--no-color']);
    expect(failing.code).toBe(1);
    expect(failing.stdout).toBe(
      [
        '✖ forms: src/c.ts:1',
        '  New import of "redux-form" is not allowed.',
        '  Preferred replacement: "react-hook-form"',
        '  Migration guide: https://example.com/forms',
        '',
        'Legacy sites: 4 remaining | 0 retired | 1 new violation',
        '',
      ].join('\n'),
    );

    repo.remove('src/c.ts');
    repo.write('src/b.ts', 'export const x = 1;\n');
    const passing = await repo.run(['check']);
    expect(passing.code).toBe(0);
    expect(passing.stdout).toContain('Legacy sites: 2 remaining | 1 retired | 0 new violations');
    expect(passing.stdout).toContain('Run "migration-tracker baseline update" to remove 1 retired site from the baseline.');

    const update = await repo.run(['baseline', 'update']);
    expect(update.code).toBe(0);
    expect(update.stdout).toContain('Removed 1 retired site');
    expect(baselineAllowed()).toEqual(['dates|src/a.ts|import|moment', 'forms|src/a.ts|import|redux-form']);
    const verified = await repo.run(['baseline', 'verify', '--base', baseRef]);
    expect(verified.code).toBe(0);
    expect(verified.stdout).toContain('1 site retired');
    repo.commit('retire b.ts');

    const cleanBaseline = repo.read('.migrations/baseline.json');
    const tampered = JSON.parse(cleanBaseline);
    tampered.allowed = [...tampered.allowed, 'forms|src/z.ts|import|redux-form'].sort();
    repo.writeJson('.migrations/baseline.json', tampered);
    const verifyFail = await repo.run(['baseline', 'verify', '--base', baseRef]);
    expect(verifyFail.code).toBe(1);
    expect(verifyFail.stdout).toContain('forms|src/z.ts|import|redux-form');
    const checkBase = await repo.run(['check', '--base', baseRef]);
    expect(checkBase.code).toBe(1);
    expect(checkBase.stdout).toContain('✖ Unauthorized baseline addition: forms|src/z.ts|import|redux-form');
    repo.write('.migrations/baseline.json', cleanBaseline);
    expect((await repo.run(['check', '--base', baseRef])).code).toBe(0);

    repo.write('src/legacy/old.ts', "import { Field } from 'redux-form';\n");
    const withException = {
      ...FORMS_DATES_CONFIG,
      exceptions: [{ groupId: 'forms', files: ['src/legacy/**'], reason: 'frozen', owner: '@team', expires: '2099-12-31' }],
    };
    repo.writeJson('migrations.json', withException);
    expect((await repo.run(['check'])).code).toBe(0);
    withException.exceptions[0]!.expires = '2000-01-01';
    repo.writeJson('migrations.json', withException);
    const expired = await repo.run(['check', '--no-color']);
    expect(expired.code).toBe(1);
    expect(expired.stdout).toContain('✖ forms: exception expired on 2000-01-01 (exceptions[0])');
    expect(expired.stdout).toContain('✖ forms: src/legacy/old.ts:1');
    repo.remove('src/legacy/old.ts');
    repo.writeJson('migrations.json', FORMS_DATES_CONFIG);
    const head = repo.commit('drop legacy dir');

    repo.write('src/d.ts', "import { reduxForm } from 'redux-form';\n");
    const changed = await repo.run(['check', '--changed-since', head]);
    expect(changed.code).toBe(1);
    expect(changed.stdout).toContain('Checked 1 changed file since');
    expect(changed.stdout).toContain('Legacy sites: 1 remaining | 0 retired | 1 new violation');
    repo.remove('src/d.ts');
    repo.write('src/a.ts', "import moment from 'moment';\n");
    const changedRetired = await repo.run(['check', '--changed-since', head, '--format', 'json']);
    expect(changedRetired.code).toBe(0);
    expect(JSON.parse(changedRetired.stdout).retired).toEqual(['forms|src/a.ts|import|redux-form']);

    const report = await repo.run(['report', '--format', 'json', '--append-history']);
    expect(report.code).toBe(0);
    const snapshot = JSON.parse(report.stdout);
    expect(snapshot.totalSites).toBe(1);
    expect(snapshot.history).toHaveLength(1);
    expect(repo.read('.migrations/history.jsonl').trim().split('\n')).toHaveLength(1);
  });
});
