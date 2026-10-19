import type { Command } from 'commander';
import path from 'node:path';

import { CliError } from './errors.js';
import { envOf } from './io.js';
import type { Context } from './load.js';
import { warn } from './output.js';
import { unlocatedWarning } from './format/types.js';
import { DEFAULT_ENGINE, ENGINES, type Engine, type EngineOptions, type ProjectScan } from './project.js';

export interface EngineFlags {
  engine?: string;
  depcruiseConfig?: string;
  tsConfig?: string;
  cache?: string | boolean;
  prefilter?: boolean;
}

export function addEngineOptions(cmd: Command): Command {
  return cmd
    .option(
      '--engine <engine>',
      `import extraction engine: ${ENGINES.join(' or ')} (default: ${DEFAULT_ENGINE}, env LEGACY_RATCHET_ENGINE)`,
    )
    .option(
      '--depcruise-config <path>',
      'dependency-cruiser config to read resolve options from (env LEGACY_RATCHET_DEPCRUISE_CONFIG)',
    )
    .option('--ts-config <path>', 'tsconfig for resolving path aliases (depcruise engine)')
    .option('--cache [dir]', 'enable the depcruise content cache (default dir: <root>/.cache/legacy-ratchet/depcruise)')
    .option('--no-cache', 'disable the depcruise cache (default)')
    .option('--no-prefilter', 'pass every file to depcruise instead of only files that mention a legacy package');
}

export function resolveEngineOptions(ctx: Context, flags: EngineFlags): EngineOptions {
  const env = envOf(ctx.io);
  const rawEngine = flags.engine ?? (env.LEGACY_RATCHET_ENGINE || undefined) ?? DEFAULT_ENGINE;
  if (!ENGINES.includes(rawEngine as Engine)) {
    throw new CliError(`Unknown engine "${rawEngine}" (expected ${ENGINES.join(' or ')})`);
  }
  const opts: EngineOptions = { engine: rawEngine as Engine };
  const depcruiseConfig = flags.depcruiseConfig ?? (env.LEGACY_RATCHET_DEPCRUISE_CONFIG || undefined);
  if (depcruiseConfig !== undefined) opts.depcruiseConfig = path.resolve(ctx.io.cwd, depcruiseConfig);
  if (flags.tsConfig !== undefined) opts.tsConfig = path.resolve(ctx.io.cwd, flags.tsConfig);
  if (typeof flags.cache === 'string') opts.cache = path.resolve(ctx.io.cwd, flags.cache);
  else if (flags.cache === true) {
    opts.cache = path.join(ctx.root, '.cache/legacy-ratchet/depcruise');
  } else opts.cache = false;
  if (flags.prefilter === false) opts.prefilter = false;
  return opts;
}

export function reportEngineWarnings(
  ctx: Context,
  scan: Pick<ProjectScan, 'warnings' | 'unlocated'>,
  opts: { unlocated?: boolean } = {},
): void {
  for (const w of scan.warnings) warn(ctx, w);
  if (opts.unlocated !== false) for (const s of scan.unlocated) warn(ctx, `${s.filePath}: ${unlocatedWarning(s.id)}`);
}
