import path from 'node:path';
import { BASELINE_PATH } from '@migration-tracker/core';
import { reportEngineWarnings, resolveEngineOptions, type EngineFlags } from '../engine-options.js';
import { CliError, withErrors } from '../errors.js';
import { formatCheckMarkdown } from '../format/markdown.js';
import { CHECK_FORMATS, fixPaths, githubPaths, renderCheck, type CheckFormat } from '../format/render.js';
import type { CheckOutcome } from '../format/types.js';
import { repoPrefix } from '../git.js';
import { createColors, envOf, type Io } from '../io.js';
import { createContext, displayPath, loadBaseline, loadConfig, appendLine, type Context, type GlobalOptions } from '../load.js';
import { buildCheckOutcome, ratchetGroupsWithoutBaseline } from '../outcome.js';
import { emit, status } from '../output.js';
import { scanProject } from '../project.js';
import { noBaselineAtBaseNotice, verifyAgainstBase } from './baseline.js';

export type { CheckFormat } from '../format/render.js';

export interface CheckOptions extends GlobalOptions, EngineFlags {
  format?: string;
  output?: string;
  changedSince?: string;
  base?: string;
}

export async function runCheck(
  ctx: Context,
  options: Pick<CheckOptions, 'changedSince' | 'base'> & EngineFlags,
): Promise<{ outcome: CheckOutcome; notices: string[] }> {
  const config = await loadConfig(ctx);
  const baseline = await loadBaseline(ctx);
  const missing = ratchetGroupsWithoutBaseline(config, baseline);
  if (missing.length > 0) {
    throw new CliError(
      `No baseline found at ${displayPath(ctx, path.join(ctx.root, BASELINE_PATH))}, but ${missing.join(', ')} use ratchet mode. Run "migration-tracker baseline create" and commit it.`,
    );
  }

  const scan = await scanProject(ctx, config, {
    ...resolveEngineOptions(ctx, options),
    ...(options.changedSince !== undefined ? { changedSince: options.changedSince } : {}),
  });
  reportEngineWarnings(ctx, scan, { unlocated: false });

  const notices: string[] = [];
  let baselineAdditions: string[] | undefined;
  if (options.base !== undefined) {
    if (baseline) {
      const v = await verifyAgainstBase(ctx, baseline, options.base);
      if (!v.base) notices.push(noBaselineAtBaseNotice(options.base));
      baselineAdditions = v.added;
    } else {
      baselineAdditions = [];
    }
  }

  const outcome = buildCheckOutcome({
    config,
    sites: scan.sites,
    baseline,
    errors: scan.errors,
    unlocated: scan.unlocated,
    fileCount: scan.fileCount,
    ...(scan.changed ? { restrictTo: scan.changed.files, changed: scan.changed } : {}),
    ...(baselineAdditions !== undefined ? { baselineAdditions } : {}),
  });
  return { outcome, notices };
}

export const checkCommand = withErrors(async (options: CheckOptions, io: Io): Promise<number> => {
  const format = (options.format ?? 'text') as CheckFormat;
  if (!CHECK_FORMATS.includes(format)) {
    throw new CliError(`Unknown format "${options.format}" (expected ${CHECK_FORMATS.join(', ')})`);
  }
  const ctx = createContext(options, io);
  const { outcome, notices } = await runCheck(ctx, options);
  for (const n of notices) status(ctx, n);

  const prefix = format === 'github' ? await repoPrefix(ctx.root) : '';
  const relConfig = path.relative(ctx.root, ctx.configPath).split(path.sep).join('/');
  const paths = fixPaths(relConfig, displayPath(ctx, ctx.configPath), BASELINE_PATH);
  const content = renderCheck(outcome, format, {
    colors: options.output === undefined ? ctx.color : createColors(false),
    quiet: ctx.quiet,
    github: githubPaths(prefix, relConfig, BASELINE_PATH),
    paths,
  });
  if (format === 'github') {
    const summaryFile = envOf(io).GITHUB_STEP_SUMMARY;
    if (summaryFile) await appendLine(summaryFile, formatCheckMarkdown(outcome, paths).trimEnd());
  }
  if (content !== '' || options.output !== undefined) await emit(ctx, content, options.output);
  return outcome.failed ? 1 : 0;
});
