import { readFile } from 'node:fs/promises';
import {
  BASELINE_PATH,
  createBaseline,
  diffBaselines,
  reconcileMigratedBaseline,
  updateBaseline,
  serializeBaseline,
  type Baseline,
} from '@migration-tracker/core';
import type { ScanError } from '@migration-tracker/scanner';
import { reportEngineWarnings, resolveEngineOptions, type EngineFlags } from '../engine-options.js';
import { withErrors } from '../errors.js';
import { revision, showFile, verifyRef } from '../git.js';
import type { Io } from '../io.js';
import {
  baselineFile,
  CliError,
  createContext,
  displayPath,
  exists,
  loadConfig,
  parseBaselineText,
  requireBaseline,
  writeTextFile,
  type Context,
  type GlobalOptions,
} from '../load.js';
import { info, plural, warn } from '../output.js';
import { scannerVersionFor, scanProject } from '../project.js';

export interface BaselineCreateOptions extends GlobalOptions, EngineFlags {
  force?: boolean;
}

export interface BaselineUpdateOptions extends GlobalOptions, EngineFlags {}

export interface BaselineMigrateOptions extends GlobalOptions, EngineFlags {}

export interface BaselineVerifyOptions extends GlobalOptions {
  base: string;
}

function warnScanErrors(ctx: Context, errors: readonly ScanError[]): void {
  for (const e of errors) warn(ctx, `${e.filePath}: could not scan file: ${e.message}`);
}

export const baselineCreateCommand = withErrors(async (options: BaselineCreateOptions, io: Io): Promise<number> => {
  const ctx = createContext(options, io);
  const config = await loadConfig(ctx);
  const file = baselineFile(ctx);
  if (!options.force && (await exists(file))) {
    throw new CliError(
      `${displayPath(ctx, file)} already exists. Use "migration-tracker baseline update" to shrink it, or --force to recreate it.`,
    );
  }
  const scan = await scanProject(ctx, config, resolveEngineOptions(ctx, options));
  reportEngineWarnings(ctx, scan);
  warnScanErrors(ctx, scan.errors);
  const rev = await revision(ctx.root);
  const baseline = createBaseline(scan.sites, {
    config,
    scannerVersion: scannerVersionFor(scan),
    ...(rev ? { revision: rev } : {}),
  });
  await writeTextFile(file, serializeBaseline(baseline));
  info(ctx, `Created ${displayPath(ctx, file)} with ${plural(baseline.allowed.length, 'allowed legacy site')}.`);
  return 0;
});

export const baselineUpdateCommand = withErrors(async (options: BaselineUpdateOptions, io: Io): Promise<number> => {
  const ctx = createContext(options, io);
  const config = await loadConfig(ctx);
  const previous = await requireBaseline(ctx);
  const scan = await scanProject(ctx, config, resolveEngineOptions(ctx, options));
  reportEngineWarnings(ctx, scan);
  warnScanErrors(ctx, scan.errors);
  const rev = await revision(ctx.root);
  const { baseline, removed } = updateBaseline(previous, scan.sites, {
    config,
    scannerVersion: scannerVersionFor(scan),
    ...(rev ? { revision: rev } : {}),
  });
  const file = baselineFile(ctx);
  await writeTextFile(file, serializeBaseline(baseline));
  info(
    ctx,
    `Removed ${plural(removed.length, 'retired site')} from ${displayPath(ctx, file)} (${baseline.allowed.length} remaining).`,
  );
  return 0;
});

export const baselineMigrateCommand = withErrors(async (options: BaselineMigrateOptions, io: Io): Promise<number> => {
  const ctx = createContext(options, io);
  const config = await loadConfig(ctx);
  const file = baselineFile(ctx);
  if (!(await exists(file))) {
    throw new CliError(`No baseline found at ${displayPath(ctx, file)}. Run "migration-tracker baseline create" instead.`);
  }
  const previous = parseBaselineText(ctx, await readFile(file, 'utf8'), displayPath(ctx, file));
  if (previous.upgradedFrom !== 1) {
    throw new CliError(`${displayPath(ctx, file)} is already schemaVersion ${previous.schemaVersion}; nothing to migrate.`);
  }
  const scan = await scanProject(ctx, config, resolveEngineOptions(ctx, options));
  reportEngineWarnings(ctx, scan);
  warnScanErrors(ctx, scan.errors);
  const rev = await revision(ctx.root);
  const { baseline, added, dropped } = reconcileMigratedBaseline(previous, scan.sites, {
    config,
    scannerVersion: scannerVersionFor(scan),
    ...(rev ? { revision: rev } : {}),
  });
  await writeTextFile(file, serializeBaseline(baseline));
  info(
    ctx,
    `Migrated ${displayPath(ctx, file)} to schemaVersion 2: ${plural(previous.allowed.length, 'mapped site')}, ${added.length} reconciled-added, ${dropped.length} dropped (${baseline.allowed.length} allowed).`,
  );
  for (const id of added) info(ctx, ctx.color.dim(`  + ${id}`));
  for (const id of dropped) info(ctx, ctx.color.dim(`  - ${id}`));
  return 0;
});

export interface BaselineVerification {
  base?: Baseline;
  added: string[];
  removed: string[];
}

export async function verifyAgainstBase(ctx: Context, current: Baseline, ref: string): Promise<BaselineVerification> {
  await verifyRef(ctx.root, ref);
  const text = await showFile(ctx.root, ref, BASELINE_PATH);
  if (text === undefined) return { added: [], removed: [] };
  const base = parseBaselineText(ctx, text, `${ref}:${BASELINE_PATH}`);
  return { base, ...diffBaselines(base, current) };
}

export function noBaselineAtBaseNotice(ref: string): string {
  return `No ${BASELINE_PATH} at ${ref}; treating this as the first adoption.`;
}

export const baselineVerifyCommand = withErrors(async (options: BaselineVerifyOptions, io: Io): Promise<number> => {
  const ctx = createContext(options, io);
  const current = await requireBaseline(ctx);
  const v = await verifyAgainstBase(ctx, current, options.base);
  if (!v.base) {
    info(ctx, noBaselineAtBaseNotice(options.base));
    return 0;
  }
  if (v.added.length > 0) {
    io.stdout(`${ctx.color.red('✖')} ${plural(v.added.length, 'unauthorized baseline addition')} since ${options.base}:\n`);
    for (const id of v.added) io.stdout(`  ${id}\n`);
    io.stdout(ctx.color.dim('The baseline may only shrink. Remove the new legacy imports instead of allowing them.\n'));
    return 1;
  }
  info(
    ctx,
    `${ctx.color.green('✔')} ${BASELINE_PATH} adds no allowances since ${options.base} (${plural(v.removed.length, 'site')} retired).`,
  );
  return 0;
});
