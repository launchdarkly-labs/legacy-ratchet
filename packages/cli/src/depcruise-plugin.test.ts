import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXAMPLES_DIR, loadDepcruise } from './__fixtures__/depcruise.js';
import { FORMS_DATES_CONFIG } from './__fixtures__/harness.js';
import migrationTrackerReporter, { runPlugin, TS_PRECOMPILATION_MESSAGE, type CruiseResult } from './depcruise-plugin.js';
import { run } from './index.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    statSync: vi.fn(actual.statSync),
    existsSync: vi.fn(actual.existsSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    appendFileSync: vi.fn(actual.appendFileSync),
  };
});

const MINIMAL: CruiseResult = {
  modules: [],
  summary: { error: 0, info: 0, warn: 0, ignore: 0, totalCruised: 0, violations: [], optionsUsed: {} },
};

const ENV_KEYS = [
  'MIGRATION_TRACKER_CONFIG',
  'MIGRATION_TRACKER_FORMAT',
  'MIGRATION_TRACKER_REPORT',
  'GITHUB_STEP_SUMMARY',
  'FORCE_COLOR',
];

let tmp: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mt-plugin-')));
  for (const k of ENV_KEYS) vi.stubEnv(k, '');
  vi.stubEnv('NO_COLOR', '1');
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function resultFor(
  baseDir: string,
  modules: CruiseResult['modules'],
  options: Record<string, unknown> = {},
): CruiseResult {
  return {
    modules,
    summary: {
      ...MINIMAL.summary,
      totalCruised: modules.length,
      optionsUsed: { baseDir, tsPreCompilationDeps: true, ...options },
    },
  };
}

function moduleWith(source: string, deps: string[]): CruiseResult['modules'][number] {
  return {
    source,
    valid: true,
    dependencies: deps.map((module) => ({
      module,
      resolved: module,
      moduleSystem: 'es6',
      dependencyTypes: ['unknown'],
      couldNotResolve: true,
      circular: false,
      coreModule: false,
      dynamic: false,
      exoticallyRequired: false,
      followable: false,
      matchesDoNotFollow: false,
      valid: true,
    })),
  } as unknown as CruiseResult['modules'][number];
}

async function cliCheck(root: string): Promise<{ code: number; stdout: string }> {
  let stdout = '';
  const code = await run(['node', 'migration-tracker', 'check', '--root', root, '--no-color'], {
    stdout: (s) => {
      stdout += s;
    },
    stderr: () => undefined,
    cwd: root,
    env: {},
    isTTY: false,
  });
  return { code, stdout };
}

async function cruiseExample(dir: string, extra: Record<string, unknown> = {}): Promise<CruiseResult> {
  const { cruise } = await loadDepcruise();
  const config = createRequire(import.meta.url)(path.join(dir, '.dependency-cruiser.cjs')) as { options: Record<string, unknown> };
  const out = await cruise(['src', 'scripts'], { ...config.options, ...extra, baseDir: dir, validate: false });
  if (typeof out.output === 'string') throw new Error('expected a cruise result');
  return out.output;
}

describe('depcruise reporter plugin contract', () => {
  it('default export is a synchronous function', () => {
    expect(typeof migrationTrackerReporter).toBe('function');
    expect(migrationTrackerReporter.constructor.name).toBe('Function');
  });

  it('answers the validation call with a plain object and touches no files', () => {
    vi.mocked(fs.readFileSync).mockClear();
    vi.mocked(fs.statSync).mockClear();
    vi.mocked(fs.existsSync).mockClear();
    const out = migrationTrackerReporter(MINIMAL);
    expect(out).not.toBeInstanceOf(Promise);
    expect(out).toEqual({ output: '', exitCode: 0 });
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(fs.statSync).not.toHaveBeenCalled();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  it('never throws on malformed input', () => {
    const out = migrationTrackerReporter({
      modules: null,
      summary: { optionsUsed: { baseDir: tmp } },
    } as unknown as CruiseResult);
    expect(out.exitCode).toBe(2);
    expect(out.output).toMatch(/^migration-tracker: /);
  });
});

const EMPTY_BASELINE = JSON.stringify({
  schemaVersion: 2,
  configDigest: 'x',
  scannerVersion: '0',
  generatedAt: '2026-01-01T00:00:00.000Z',
  allowed: [],
});

describe('config discovery', () => {
  beforeEach(() => {
    write('migrations.json', JSON.stringify(FORMS_DATES_CONFIG));
    write('.migrations/baseline.json', EMPTY_BASELINE);
    write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
  });

  it('walks up from optionsUsed.baseDir to migrations.json', () => {
    const out = migrationTrackerReporter(resultFor(path.join(tmp, 'src'), [moduleWith('a.ts', ['redux-form'])]));
    expect(out.exitCode).toBe(1);
    expect(out.output).toContain('✖ forms: src/a.ts:1');
  });

  it('uses MIGRATION_TRACKER_CONFIG relative to cwd', () => {
    fs.mkdirSync(path.join(tmp, 'elsewhere'));
    const env = { MIGRATION_TRACKER_CONFIG: '../migrations.json' };
    const out = runPlugin(resultFor(tmp, [moduleWith('src/a.ts', ['redux-form'])]), {
      env,
      cwd: path.join(tmp, 'elsewhere'),
      isTTY: false,
    });
    expect(out.exitCode).toBe(1);
    expect(out.output).toContain('✖ forms: src/a.ts:1');

    vi.stubEnv('MIGRATION_TRACKER_CONFIG', path.join(tmp, 'migrations.json'));
    const viaProcess = migrationTrackerReporter(resultFor(tmp, [moduleWith('src/a.ts', ['redux-form'])]));
    expect(viaProcess.exitCode).toBe(1);
  });

  it('exits 2 when no migrations.json is found for real modules', () => {
    fs.rmSync(path.join(tmp, 'migrations.json'));
    const out = migrationTrackerReporter(resultFor(tmp, [moduleWith('src/a.ts', ['redux-form'])]));
    expect(out.exitCode).toBe(2);
    expect(out.output).toContain('no migrations.json found');
  });

  it('exits 2 for an invalid config or a missing ratchet baseline', () => {
    const bad = runPlugin(resultFor(tmp, [moduleWith('src/a.ts', ['redux-form'])]), {
      env: { MIGRATION_TRACKER_CONFIG: path.join(tmp, 'missing.json') },
      cwd: tmp,
      isTTY: false,
    });
    expect(bad.exitCode).toBe(2);
    expect(bad.output).toContain('No config found');
    fs.rmSync(path.join(tmp, '.migrations/baseline.json'));
    const noBaseline = migrationTrackerReporter(resultFor(tmp, [moduleWith('src/a.ts', [])]));
    expect(noBaseline.exitCode).toBe(2);
    expect(noBaseline.output).toContain('no baseline found');
    write('invalid.json', '{"version": 2}');
    vi.stubEnv('MIGRATION_TRACKER_CONFIG', path.join(tmp, 'invalid.json'));
    const invalid = migrationTrackerReporter(resultFor(tmp, [moduleWith('src/a.ts', [])]));
    expect(invalid.exitCode).toBe(2);
    expect(invalid.output).toContain('Invalid config');
  });

  it('exits 2 unless tsPreCompilationDeps is true', () => {
    for (const value of [false, 'specify', undefined]) {
      const out = migrationTrackerReporter(
        resultFor(tmp, [moduleWith('src/a.ts', ['redux-form'])], { tsPreCompilationDeps: value }),
      );
      expect(out).toEqual({ output: `migration-tracker: ${TS_PRECOMPILATION_MESSAGE}\n`, exitCode: 2 });
    }
  });

  it('rejects an unknown MIGRATION_TRACKER_FORMAT', () => {
    vi.stubEnv('MIGRATION_TRACKER_FORMAT', 'xml');
    expect(migrationTrackerReporter(resultFor(tmp, [moduleWith('src/a.ts', [])])).exitCode).toBe(2);
  });
});

describe('formats and reports', () => {
  beforeEach(() => {
    write('migrations.json', JSON.stringify(FORMS_DATES_CONFIG));
    write(
      '.migrations/baseline.json',
      JSON.stringify({
        schemaVersion: 2,
        configDigest: 'x',
        scannerVersion: '0',
        generatedAt: '2026-01-01T00:00:00.000Z',
        allowed: [
          'forms|src/a.ts|import|redux-form',
          'forms|src/gone.ts|import|redux-form',
          'forms|src/uncruised.ts|import|redux-form',
        ],
      }),
    );
    write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
    write('src/b.ts', "import { Field } from 'redux-form';\nimport moment from 'moment';\n");
    write('src/gone.ts', 'export {};\n');
  });

  const modules = () => [
    moduleWith('src/a.ts', ['redux-form']),
    moduleWith('src/b.ts', ['redux-form', 'moment']),
    moduleWith('src/gone.ts', []),
  ];

  it('restricts the baseline to cruised files', () => {
    vi.stubEnv('MIGRATION_TRACKER_FORMAT', 'json');
    const out = migrationTrackerReporter(resultFor(tmp, modules()));
    const json = JSON.parse(out.output) as {
      retired: string[];
      violations: Array<{ filePath: string; line: number; kinds: string[] }>;
    };
    expect(out.exitCode).toBe(1);
    expect(json.retired).toEqual(['forms|src/gone.ts|import|redux-form']);
    expect(json.violations).toMatchObject([{ filePath: 'src/b.ts', line: 1, kinds: ['import'] }]);
  });

  it('writes github annotations and the step summary', () => {
    const summary = path.join(tmp, 'summary.md');
    vi.stubEnv('MIGRATION_TRACKER_FORMAT', 'github');
    vi.stubEnv('GITHUB_STEP_SUMMARY', summary);
    const out = migrationTrackerReporter(resultFor(tmp, modules()));
    expect(out.output).toContain('::error file=src/b.ts,line=1,col=23,title=migration-tracker/forms::');
    expect(out.output).toContain('"// migration-tracker-disable-next-line forms -- <why this import must stay>" above this line. See the job summary for exceptions.');
    const written = fs.readFileSync(summary, 'utf8');
    expect(written).toContain('## migration-tracker');
    expect(written).toContain('### How to fix');
    expect(written).toContain('"src/b.ts"');
  });

  it('prints markdown', () => {
    vi.stubEnv('MIGRATION_TRACKER_FORMAT', 'markdown');
    const md = migrationTrackerReporter(resultFor(tmp, modules())).output;
    expect(md).toContain('**✖ Check failed.**');
    expect(md).toContain('### How to fix');
    expect(md).toContain('   // migration-tracker-disable-next-line forms -- <why this import must stay>');
  });

  it('colours text only on a TTY without NO_COLOR', () => {
    const r = resultFor(tmp, modules());
    expect(runPlugin(r, { env: {}, cwd: tmp, isTTY: true }).output).toContain('\u001b[');
    expect(runPlugin(r, { env: { NO_COLOR: '1' }, cwd: tmp, isTTY: true }).output).not.toContain('\u001b[');
    expect(runPlugin(r, { env: {}, cwd: tmp, isTTY: false }).output).not.toContain('\u001b[');
  });

  it('counts adoption and CODEOWNERS owners in the MIGRATION_TRACKER_REPORT snapshot', () => {
    write('CODEOWNERS', '/src/b.ts @acme/web\n');
    vi.stubEnv('MIGRATION_TRACKER_REPORT', path.join(tmp, 'out/report.json'));
    migrationTrackerReporter(resultFor(tmp, [...modules(), moduleWith('src/n.ts', ['react-hook-form', 'dayjs'])]));
    const snapshot = JSON.parse(fs.readFileSync(path.join(tmp, 'out/report.json'), 'utf8')) as {
      groups: Array<{ id: string; newSites: number; byOwner: Record<string, number> }>;
    };
    expect(snapshot.groups.map((g) => [g.id, g.newSites, g.byOwner])).toEqual([
      ['forms', 1, { '@acme/web': 1, Unowned: 1 }],
      ['dates', 1, { '@acme/web': 1 }],
    ]);
  });

  it('writes a JSON snapshot and an HTML report with MIGRATION_TRACKER_REPORT', () => {
    vi.stubEnv('MIGRATION_TRACKER_REPORT', path.join(tmp, 'out/report.json'));
    migrationTrackerReporter(resultFor(tmp, modules()));
    const snapshot = JSON.parse(fs.readFileSync(path.join(tmp, 'out/report.json'), 'utf8')) as {
      schemaVersion: number;
      totalSites: number;
    };
    expect(snapshot).toMatchObject({ schemaVersion: 2, totalSites: 3 });

    vi.stubEnv('MIGRATION_TRACKER_REPORT', path.join(tmp, 'out/report.html'));
    const html = migrationTrackerReporter(resultFor(tmp, modules()));
    if (fs.existsSync(path.join(tmp, 'out/report.html'))) {
      expect(fs.readFileSync(path.join(tmp, 'out/report.html'), 'utf8')).toContain('"totalSites":3');
    } else {
      expect(html.output).toContain('dashboard template is missing');
    }

    vi.stubEnv('MIGRATION_TRACKER_REPORT', path.join(tmp, 'out/report.txt'));
    expect(migrationTrackerReporter(resultFor(tmp, modules())).output).toContain('must end in .json or .html');
  });
});

describe('parity with migration-tracker check on examples/vite-react', () => {
  it('prints the same text as migration-tracker check --no-color', async () => {
    const dir = path.join(EXAMPLES_DIR, 'vite-react');
    const out = migrationTrackerReporter(await cruiseExample(dir));
    const cli = await cliCheck(dir);
    expect(out.exitCode).toBe(cli.code);
    expect(out.output).toBe(cli.stdout);
    expect(out.output).toBe('Legacy sites: 9 remaining | 0 retired | 0 new violations\n');
  });

  it('keeps imports of installed packages with the example config', async () => {
    const dir = path.join(tmp, 'installed');
    fs.cpSync(path.join(EXAMPLES_DIR, 'vite-react'), dir, { recursive: true });
    for (const name of ['moment', 'redux-form', 'axios', 'request']) {
      write(`installed/node_modules/${name}/package.json`, JSON.stringify({ name, main: 'index.js' }));
      write(`installed/node_modules/${name}/index.js`, 'module.exports = {};\n');
    }
    const result = await cruiseExample(dir);
    const resolved = result.modules.flatMap((m) => m.dependencies).filter((d) => d.resolved.startsWith('node_modules/'));
    expect(resolved.length).toBeGreaterThan(0);
    expect(migrationTrackerReporter(result).output).toBe('Legacy sites: 9 remaining | 0 retired | 0 new violations\n');

    const excluded = migrationTrackerReporter(await cruiseExample(dir, { exclude: { path: 'node_modules' } }));
    expect(excluded.exitCode).toBe(2);
    expect(excluded.output).toContain('exclude option matches node_modules');
    const included = migrationTrackerReporter(await cruiseExample(dir, { includeOnly: '^src' }));
    expect(included.exitCode).toBe(2);
    expect(included.output).toContain('includeOnly option does not match node_modules');
  });

  it('matches migration-tracker check on a new violation', async () => {
    const dir = path.join(tmp, 'vite-react');
    fs.cpSync(path.join(EXAMPLES_DIR, 'vite-react'), dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src/lib/newDates.ts'),
      "import moment from 'moment';\nexport const now = () => moment();\n",
    );
    const out = migrationTrackerReporter(await cruiseExample(dir));
    const cli = await cliCheck(dir);
    expect(out.exitCode).toBe(1);
    expect(cli.code).toBe(1);
    expect(out.output).toBe(cli.stdout);
    expect(out.output).toContain('✖ dates: src/lib/newDates.ts:1');
    expect(out.output).toContain('\nHow to fix\n');
    expect(out.output).toContain('       // migration-tracker-disable-next-line dates -- <why this import must stay>\n');
    expect(out.output).toContain('               "src/lib/newDates.ts"\n');
  });
});
