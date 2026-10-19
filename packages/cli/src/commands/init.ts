import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { withErrors } from '../errors.js';
import type { Io } from '../io.js';
import { createContext, displayPath, exists, writeTextFile, CliError, type Context, type GlobalOptions } from '../load.js';
import { info } from '../output.js';

export interface InitOptions extends GlobalOptions {
  force?: boolean;
}

export const SAMPLE_CONFIG = {
  $schema: './node_modules/@migration-tracker/core/schema.json',
  version: 1,
  groups: {
    dates: {
      description: 'Example group: replace moment with date-fns. Edit or replace this with your own migrations.',
      old: ['moment'],
      new: ['date-fns'],
      enforcement: { mode: 'report' },
    },
  },
} as const;

export const MIGRATIONS_README = `# .migrations

This directory is managed by migration-tracker.

- \`baseline.json\` lists the legacy import sites that existed when the baseline was created. They are
  grandfathered: \`migration-tracker check\` only fails on import sites that are not in this file.
- \`history.jsonl\` (optional) stores one snapshot of legacy-site totals per line, appended by
  \`migration-tracker report --append-history\`, and powers the trend charts in the HTML report.

## Workflow

1. Describe deprecated packages in \`migrations.json\` (\`old\` -> \`new\`, enforcement \`report\`, \`ratchet\` or \`ban\`).
2. Run \`migration-tracker baseline create\` and commit \`.migrations/baseline.json\`.
3. Run \`migration-tracker check\` in CI. New legacy imports fail the build; existing ones are allowed.
4. When you remove legacy imports, run \`migration-tracker baseline update\` and commit the smaller baseline.
   The baseline only ever shrinks: \`migration-tracker baseline update\` never adds allowances, and
   \`migration-tracker check --base <ref>\` (or \`migration-tracker baseline verify --base <ref>\`) fails if someone adds one by hand.
`;

const CANDIDATES: Record<string, { replacement: string; hintOnly?: boolean }> = {
  moment: { replacement: 'date-fns' },
  request: { replacement: 'ky' },
  enzyme: { replacement: '@testing-library/react' },
  'redux-form': { replacement: 'react-hook-form' },
  tslint: { replacement: 'eslint' },
  'node-sass': { replacement: 'sass' },
  lodash: { replacement: 'es-toolkit', hintOnly: true },
};

async function detectCandidates(ctx: Context): Promise<string[]> {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(await readFile(path.join(ctx.root, 'package.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return [];
  }
  const names = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[field];
    if (deps && typeof deps === 'object') for (const name of Object.keys(deps)) names.add(name);
  }
  return Object.keys(CANDIDATES).filter((name) => names.has(name)).sort();
}

export const initCommand = withErrors(async (options: InitOptions, io: Io): Promise<number> => {
  const ctx = createContext(options, io);
  if (!options.force && (await exists(ctx.configPath))) {
    throw new CliError(`${displayPath(ctx, ctx.configPath)} already exists. Use --force to overwrite it.`);
  }
  await writeTextFile(ctx.configPath, JSON.stringify(SAMPLE_CONFIG, null, 2));
  const readme = path.join(ctx.root, '.migrations', 'README.md');
  if (options.force || !(await exists(readme))) await writeTextFile(readme, MIGRATIONS_README);
  info(ctx, `Created ${displayPath(ctx, ctx.configPath)} and ${displayPath(ctx, readme)}`);

  const detected = await detectCandidates(ctx);
  if (detected.length > 0) {
    info(ctx, '');
    info(ctx, 'Detected dependencies that are common migration candidates. Consider adding groups like:');
    for (const name of detected) {
      const c = CANDIDATES[name]!;
      const group = JSON.stringify({ old: [name], new: [c.replacement], enforcement: { mode: 'ratchet' } });
      info(ctx, c.hintOnly ? `  // hint: "${name}" is often fine to keep; if you migrate off it: ${group}` : `  // "${name.replace(/[^a-z0-9_-]/g, '-')}": ${group}`);
    }
  }
  info(ctx, '');
  info(ctx, 'Next: edit migrations.json, then run "migration-tracker baseline create" and commit .migrations/baseline.json.');
  return 0;
});
