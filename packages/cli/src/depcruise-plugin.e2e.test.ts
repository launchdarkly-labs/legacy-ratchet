import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { DEPCRUISE_BIN, EXAMPLES_DIR, PLUGIN_DIST } from './__fixtures__/depcruise.js';

const CLI_BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const built = existsSync(PLUGIN_DIST) && existsSync(CLI_BIN);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'mt-plugin-e2e-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function env(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  for (const k of [
    'MIGRATION_TRACKER_CONFIG',
    'MIGRATION_TRACKER_FORMAT',
    'MIGRATION_TRACKER_REPORT',
    'GITHUB_STEP_SUMMARY',
    'FORCE_COLOR',
  ])
    delete out[k];
  return out;
}

function depcruise(cwd: string, pluginPath: string) {
  return spawnSync(
    process.execPath,
    [DEPCRUISE_BIN, '--config', '.dependency-cruiser.cjs', '--output-type', `plugin:${pluginPath}`, 'src', 'scripts'],
    { cwd, encoding: 'utf8', env: env() },
  );
}

describe.skipIf(!built)('dependency-cruiser runs the reporter plugin end to end', () => {
  it('migration-tracker depcruise-plugin-path prints the built plugin', () => {
    const r = spawnSync(process.execPath, [CLI_BIN, 'depcruise-plugin-path'], { encoding: 'utf8', env: env() });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(PLUGIN_DIST);
    expect(path.isAbsolute(r.stdout.trim())).toBe(true);
    expect(r.stderr).toBe('');
  });

  it('passes on examples/vite-react and fails after a new moment import', () => {
    const pass = depcruise(path.join(EXAMPLES_DIR, 'vite-react'), PLUGIN_DIST);
    expect(pass.stderr).toBe('');
    expect(pass.status).toBe(0);
    expect(pass.stdout).toBe('Legacy sites: 9 remaining | 0 retired | 0 new violations\n');

    const copy = path.join(tmp, 'vite-react');
    cpSync(path.join(EXAMPLES_DIR, 'vite-react'), copy, { recursive: true });
    writeFileSync(
      path.join(copy, 'src/lib/newDates.ts'),
      "import moment from 'moment';\nexport const now = () => moment();\n",
    );
    const fail = depcruise(copy, PLUGIN_DIST);
    expect(fail.status).toBe(1);
    expect(fail.stdout).toContain('✖ dates: src/lib/newDates.ts:1\n  New import of "moment" is not allowed.');
    expect(fail.stdout).toContain('Legacy sites: 10 remaining | 0 retired | 1 new violation');
  });
});
