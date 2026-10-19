import {
  assignOwners,
  BASELINE_PATH,
  buildReport,
  collectAdoption,
  collectSites,
  enrichSites,
  HISTORY_PATH,
  type BaselineRevision,
  type ImportSite,
  type LegacyConfig,
  type RawImport,
} from '@legacy-ratchet/core';
import { renderHtml, templatePath } from '@legacy-ratchet/dashboard';
import { fromCruiseResult } from '@legacy-ratchet/depcruise/map';
import { scanSource, type ScanError } from '@legacy-ratchet/scanner';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CliError, errorMessage } from './errors.js';
import { formatCheckMarkdown } from './format/markdown.js';
import { CHECK_FORMATS, githubPaths, renderCheck, type CheckFormat } from './format/render.js';
import { colorEnabled, createColors, type Env } from './io.js';
import { locateConfig } from './load-sync.js';
import { loadBaselineSync, loadCodeownersSync, loadConfigSync, loadHistorySync } from './load.js';
import { buildCheckOutcome, ratchetGroupsWithoutBaseline } from './outcome.js';

export type CruiseResult = Parameters<typeof fromCruiseResult>[0];

export interface ReporterOutput {
  output: string;
  exitCode: number;
}

export interface PluginEnvironment {
  env: Env;
  cwd: string;
  isTTY: boolean;
}

export const TS_PRECOMPILATION_MESSAGE =
  'legacy-ratchet requires tsPreCompilationDeps: true (type-only imports would be dropped)';

const NODE_MODULES_SAMPLE = 'node_modules/x/dist/index.js';

function filterPaths(filter: unknown): string[] {
  const value = typeof filter === 'object' && filter !== null && !Array.isArray(filter) ? (filter as { path?: unknown }).path : filter;
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function matchesNodeModules(patterns: readonly string[]): boolean {
  return patterns.some((p) => {
    try {
      return new RegExp(p).test(NODE_MODULES_SAMPLE);
    } catch {
      return false;
    }
  });
}

export function packageFilterProblem(optionsUsed: { exclude?: unknown; includeOnly?: unknown }): string | undefined {
  const exclude = filterPaths(optionsUsed.exclude);
  if (matchesNodeModules(exclude)) {
    return 'the depcruise exclude option matches node_modules, which drops imports of installed packages; remove node_modules from exclude (doNotFollow is enough)';
  }
  const includeOnly = filterPaths(optionsUsed.includeOnly);
  if (includeOnly.length > 0 && !matchesNodeModules(includeOnly)) {
    return 'the depcruise includeOnly option does not match node_modules, which drops imports of installed packages; remove includeOnly or run the plugin from a config without it';
  }
  return undefined;
}

function withNewline(s: string): string {
  return s === '' || s.endsWith('\n') ? s : `${s}\n`;
}

function failure(message: string, details: readonly string[] = []): ReporterOutput {
  return { output: [`legacy-ratchet: ${message}`, ...details.map((d) => `  ${d}`)].join('\n') + '\n', exitCode: 2 };
}

function tryGit(root: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync('git', [...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function revisionSync(root: string): BaselineRevision | undefined {
  const commit = tryGit(root, ['rev-parse', 'HEAD']);
  if (!commit) return undefined;
  const branch = tryGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return branch && branch !== 'HEAD' ? { commit, branch } : { commit };
}

function locateSites(
  root: string,
  config: LegacyConfig,
  base: readonly ImportSite[],
): { sites: ImportSite[]; unlocated: ImportSite[]; errors: ScanError[] } {
  const flagged = [...new Set(base.map((s) => s.filePath))].sort();
  const imports: RawImport[] = [];
  const errors: ScanError[] = [];
  for (const file of flagged) {
    try {
      imports.push(...scanSource(readFileSync(path.join(root, file), 'utf8'), file));
    } catch (err) {
      errors.push({ filePath: file, message: errorMessage(err) });
    }
  }
  const { sites, unlocated } = enrichSites(base, collectSites(config, imports));
  const unreadable = new Set(errors.map((e) => e.filePath));
  return { sites, unlocated: unlocated.filter((s) => !unreadable.has(s.filePath)), errors };
}

function writeReport(
  file: string,
  root: string,
  config: LegacyConfig,
  sites: readonly ImportSite[],
  imports: readonly RawImport[],
  notes: string[],
): void {
  const history = loadHistorySync(path.join(root, HISTORY_PATH), (m) => notes.push(`warning: ${m}`));
  const revision = revisionSync(root);
  const rules = loadCodeownersSync(root);
  const report = buildReport(config, rules ? assignOwners(sites, rules) : sites, {
    history,
    adoption: collectAdoption(config, imports),
    ...(revision ? { revision } : {}),
  });
  let content: string;
  if (file.endsWith('.json')) {
    content = `${JSON.stringify(report, null, 2)}\n`;
  } else if (file.endsWith('.html')) {
    if (!existsSync(templatePath())) {
      notes.push('warning: LEGACY_RATCHET_REPORT: the dashboard template is missing; build @legacy-ratchet/dashboard');
      return;
    }
    content = renderHtml(report);
  } else {
    notes.push(`warning: LEGACY_RATCHET_REPORT must end in .json or .html (got ${file})`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

export function runPlugin(result: CruiseResult, environment: PluginEnvironment): ReporterOutput {
  try {
    return check(result, environment);
  } catch (err) {
    return err instanceof CliError ? failure(err.message, err.details) : failure(errorMessage(err));
  }
}

function check(result: CruiseResult, environment: PluginEnvironment): ReporterOutput {
  const { env, cwd } = environment;
  const optionsUsed = result.summary?.optionsUsed ?? {};
  const baseDir = path.resolve(cwd, optionsUsed.baseDir ?? cwd);

  const rawFormat = env.LEGACY_RATCHET_FORMAT || 'text';
  if (!CHECK_FORMATS.includes(rawFormat as CheckFormat)) {
    return failure(`unknown LEGACY_RATCHET_FORMAT "${rawFormat}" (expected ${CHECK_FORMATS.join(', ')})`);
  }
  const format = rawFormat as CheckFormat;

  const location = locateConfig(env.LEGACY_RATCHET_CONFIG, cwd, baseDir);
  if (!location) {
    return failure(`no legacy.json found at or above ${baseDir} (set LEGACY_RATCHET_CONFIG to point at one)`);
  }
  if (optionsUsed.tsPreCompilationDeps !== true) return failure(TS_PRECOMPILATION_MESSAGE);
  const filterProblem = packageFilterProblem(optionsUsed);
  if (filterProblem) return failure(filterProblem);

  const { root, configPath } = location;
  const config = loadConfigSync(configPath);
  const baseline = loadBaselineSync(path.join(root, BASELINE_PATH));
  const missing = ratchetGroupsWithoutBaseline(config, baseline);
  if (missing.length > 0) {
    return failure(
      `no baseline found at ${path.join(root, BASELINE_PATH)}, but ${missing.join(', ')} use ratchet mode. Run "legacy baseline create" and commit it.`,
    );
  }

  const mapped = fromCruiseResult(result, { root, baseDir, ignore: config.ignore ?? [] });
  const located = locateSites(root, config, collectSites(config, mapped.imports));
  const outcome = buildCheckOutcome({
    config,
    sites: located.sites,
    baseline,
    restrictTo: mapped.files,
    errors: located.errors,
    unlocated: located.unlocated,
    fileCount: mapped.files.length,
  });

  const notes: string[] = [];
  const prefix = format === 'github' ? (tryGit(root, ['rev-parse', '--show-prefix']) ?? '') : '';
  const relConfig = path.relative(root, configPath).split(path.sep).join('/');
  const colors = createColors(
    format === 'text' &&
      colorEnabled({ stdout: () => undefined, stderr: () => undefined, cwd, env, isTTY: environment.isTTY }, undefined),
  );
  const output = renderCheck(outcome, format, {
    colors,
    quiet: false,
    github: githubPaths(prefix, relConfig, BASELINE_PATH),
  });
  if (format === 'github' && env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${formatCheckMarkdown(outcome).trimEnd()}\n`, 'utf8');
  }
  if (env.LEGACY_RATCHET_REPORT) {
    writeReport(path.resolve(cwd, env.LEGACY_RATCHET_REPORT), root, config, located.sites, mapped.imports, notes);
  }
  return {
    output: withNewline(output) + notes.map((n) => `${n}\n`).join(''),
    exitCode: outcome.failed ? 1 : 0,
  };
}

export default function legacyRatchetReporter(result: CruiseResult): ReporterOutput {
  try {
    if ((result?.modules?.length ?? 0) === 0 && Object.keys(result?.summary?.optionsUsed ?? {}).length === 0) {
      return { output: '', exitCode: 0 };
    }
    return runPlugin(result, { env: process.env, cwd: process.cwd(), isTTY: Boolean(process.stdout.isTTY) });
  } catch (err) {
    return failure(errorMessage(err));
  }
}
