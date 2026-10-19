import type { ExtractOptions, ExtractResult } from '@legacy-ratchet/depcruise';
import { extractWithDepcruise } from '@legacy-ratchet/depcruise';
import { SCANNER_VERSION } from '@legacy-ratchet/scanner';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FORMS_DATES_CONFIG, TempRepo } from './__fixtures__/harness.js';
import { CliError } from './errors.js';
import { createContext } from './load.js';
import { scanProject, unlocatedWarning } from './project.js';

const examples = fileURLToPath(new URL('../../../examples/', import.meta.url));

let repo: TempRepo;

beforeEach(() => {
  repo = new TempRepo();
});

afterEach(() => {
  repo.cleanup();
});

function quietIo(cwd: string) {
  return { stdout: () => undefined, stderr: () => undefined, cwd, env: {} };
}

describe('engine parity on the examples', () => {
  for (const name of ['vite-react', 'pnpm-monorepo']) {
    it(`--engine scanner and --engine depcruise create identical baselines for ${name}`, async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), `legacy-engine-${name}-`));
      try {
        cpSync(path.join(examples, name), dir, { recursive: true });
        const committed = JSON.parse(readFileSync(path.join(dir, '.legacy/baseline.json'), 'utf8')) as {
          allowed: string[];
        };
        const baselines: Record<string, { allowed: string[]; configDigest: string; scannerVersion: string }> = {};
        for (const engine of ['scanner', 'depcruise']) {
          const r = await repo.run(['baseline', 'create', '--force', '--root', dir, '--engine', engine]);
          expect(r.code, r.stderr).toBe(0);
          expect(r.stderr).toBe('');
          baselines[engine] = JSON.parse(readFileSync(path.join(dir, '.legacy/baseline.json'), 'utf8'));
        }
        expect(baselines.depcruise!.allowed).toEqual(baselines.scanner!.allowed);
        expect(baselines.depcruise!.configDigest).toBe(baselines.scanner!.configDigest);
        expect(baselines.depcruise!.allowed).toEqual(committed.allowed);
        expect(baselines.scanner!.scannerVersion).toBe(SCANNER_VERSION);
        expect(baselines.depcruise!.scannerVersion).toMatch(
          new RegExp(`^${SCANNER_VERSION.replace(/\./g, '\\.')}\\+dependency-cruiser@\\d`),
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe('engine selection', () => {
  it('honours LEGACY_RATCHET_ENGINE and rejects unknown engines', async () => {
    repo.writeJson('legacy.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
    const viaEnv = await repo.run(['baseline', 'create'], { env: { LEGACY_RATCHET_ENGINE: 'scanner' } });
    expect(viaEnv.code).toBe(0);
    expect(JSON.parse(repo.read('.legacy/baseline.json')).scannerVersion).toBe(SCANNER_VERSION);

    const flagWins = await repo.run(['baseline', 'create', '--force', '--engine', 'depcruise'], {
      env: { LEGACY_RATCHET_ENGINE: 'scanner' },
    });
    expect(flagWins.code).toBe(0);
    expect(JSON.parse(repo.read('.legacy/baseline.json')).scannerVersion).toContain('+dependency-cruiser@');

    const bad = await repo.run(['check', '--engine', 'eslint']);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toBe('error: Unknown engine "eslint" (expected depcruise or scanner)\n');
    const badEnv = await repo.run(['scan'], { env: { LEGACY_RATCHET_ENGINE: 'nope' } });
    expect(badEnv.code).toBe(2);
  });

  it('accepts engine flags alongside global options after the subcommand', async () => {
    const app = 'packages/app';
    repo.writeJson(`${app}/legacy.json`, FORMS_DATES_CONFIG);
    repo.write(`${app}/src/a.ts`, "import { reduxForm } from 'redux-form';\n");
    const create = await repo.run([
      'baseline',
      'create',
      '--root',
      app,
      '--no-prefilter',
      '--no-cache',
      '--quiet',
      '--engine',
      'depcruise',
    ]);
    expect(create).toEqual({ code: 0, stdout: '', stderr: '' });
    for (const engine of ['scanner', 'depcruise']) {
      const check = await repo.run(['check', '--engine', engine, '--root', app, '--format', 'json', '--no-color']);
      expect(check.code).toBe(0);
    }
    const report = await repo.run(['report', '--format', 'json', '--root', app, '--engine', 'scanner']);
    expect(JSON.parse(report.stdout).totalSites).toBe(1);
  });

  it('reads resolve options from --depcruise-config and LEGACY_RATCHET_DEPCRUISE_CONFIG', async () => {
    repo.writeJson('legacy.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
    repo.write('.dependency-cruiser.cjs', "module.exports = { options: { includeOnly: '^src' } };\n");
    const flag = await repo.run(['scan', '--depcruise-config', '.dependency-cruiser.cjs', '--format', 'json']);
    expect(flag.code).toBe(0);
    expect(flag.stderr).toContain('depcruise option "includeOnly" is ignored');
    expect(JSON.parse(flag.stdout).sites).toHaveLength(1);
    const env = await repo.run(['scan', '--format', 'json'], {
      env: { LEGACY_RATCHET_DEPCRUISE_CONFIG: '.dependency-cruiser.cjs' },
    });
    expect(env.stderr).toContain('depcruise option "includeOnly" is ignored');
  });

  it('writes the depcruise cache only with --cache', async () => {
    repo.writeJson('legacy.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
    expect((await repo.run(['scan'])).code).toBe(0);
    expect(repo.exists('.cache')).toBe(false);
    const spy = vi.fn(extractWithDepcruise);
    const ctx = createContext({}, quietIo(repo.dir));
    await scanProject(ctx, FORMS_DATES_CONFIG as never, { cache: path.join(repo.dir, 'cache-dir'), extract: spy });
    expect(spy.mock.calls[0]![0].cache).toBe(path.join(repo.dir, 'cache-dir'));
  });
});

describe('scanProject with the depcruise engine', () => {
  it('passes only changed files to extract with --changed-since', async () => {
    repo.writeJson('legacy.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
    repo.write('src/b.ts', "import moment from 'moment';\n");
    const head = repo.commit('initial');
    repo.write('src/c.ts', "import { Field } from 'redux-form';\n");
    repo.write('src/b.ts', "import moment from 'moment';\nexport const x = 1;\n");

    const calls: ExtractOptions[] = [];
    const extract = async (opts: ExtractOptions): Promise<ExtractResult> => {
      calls.push(opts);
      return extractWithDepcruise(opts);
    };
    const ctx = createContext({}, quietIo(repo.dir));
    const scan = await scanProject(ctx, FORMS_DATES_CONFIG as never, { changedSince: head, extract });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.files).toEqual(['src/b.ts', 'src/c.ts']);
    expect(calls[0]!.prefilter).toEqual(['moment', 'redux-form']);
    expect(scan.sites.map((s) => s.id)).toEqual(['dates|src/b.ts|import|moment', 'forms|src/c.ts|import|redux-form']);
    expect(scan.sites.map((s) => s.line)).toEqual([1, 1]);
    expect(scan.changed).toEqual({ ref: head, files: ['src/b.ts', 'src/c.ts'] });

    calls.length = 0;
    repo.commit('more');
    await scanProject(ctx, FORMS_DATES_CONFIG as never, { changedSince: 'HEAD', extract });
    expect(calls).toHaveLength(0);
  });

  it('omits the prefilter with prefilter: false', async () => {
    repo.writeJson('legacy.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
    const spy = vi.fn(extractWithDepcruise);
    const ctx = createContext({}, quietIo(repo.dir));
    await scanProject(ctx, FORMS_DATES_CONFIG as never, { prefilter: false, extract: spy });
    expect(spy.mock.calls[0]![0]).not.toHaveProperty('prefilter');
    expect(spy.mock.calls[0]![0]).not.toHaveProperty('files');
  });

  it('turns an extract run error into a CliError naming the file', async () => {
    repo.writeJson('legacy.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
    const extract = async (): Promise<ExtractResult> => ({
      imports: [],
      files: ['src/a.ts'],
      errors: [{ filePath: 'src/a.ts', message: 'boom (dependency-cruiser stops the whole run on one bad file)' }],
      warnings: [],
      engineVersion: 'dependency-cruiser@0',
    });
    const ctx = createContext({}, quietIo(repo.dir));
    const err = await scanProject(ctx, FORMS_DATES_CONFIG as never, { extract }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).exitCode).toBe(2);
    expect((err as CliError).details).toEqual([
      'src/a.ts: boom (dependency-cruiser stops the whole run on one bad file)',
    ]);
  });

  it('warns about sites depcruise reports but the scanner cannot locate', async () => {
    repo.writeJson('legacy.json', FORMS_DATES_CONFIG);
    repo.write('src/a.ts', "import { reduxForm } from 'redux-form';\n");
    repo.write('src/t.ts', "export type M = typeof import('moment');\n");
    repo.commit('initial');
    expect((await repo.run(['baseline', 'create', '--engine', 'scanner'])).code).toBe(0);

    const scannerCheck = await repo.run(['check', '--engine', 'scanner', '--no-color']);
    expect(scannerCheck.code).toBe(0);

    const check = await repo.run(['check', '--no-color']);
    expect(check.code).toBe(0);
    const id = 'dates|src/t.ts|import|moment';
    expect(check.stdout).toContain(`⚠ src/t.ts: ${unlocatedWarning(id)}`);
    expect(check.stdout).toContain('Legacy sites: 2 remaining | 0 retired | 0 new violations');

    const scan = await repo.run(['scan', '--no-color']);
    expect(scan.stderr).toContain(`src/t.ts: ${unlocatedWarning(id)}`);
    expect(scan.stdout).toContain('  src/t.ts  moment  (import)');

    const github = await repo.run(['check', '--format', 'github']);
    expect(github.stdout).toContain('::warning file=src/t.ts,title=legacy-ratchet::position unavailable for');
  });
});
