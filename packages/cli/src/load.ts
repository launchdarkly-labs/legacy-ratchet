import { readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASELINE_PATH,
  CODEOWNERS_LOCATIONS,
  CONFIG_FILENAME,
  HISTORY_PATH,
  parseBaseline,
  parseCodeowners,
  parseConfig,
  type Baseline,
  type CodeownersRule,
  type HistoryEntry,
  type LegacyConfig,
  type ValidationIssue,
} from '@migration-tracker/core';
import { CliError, errorMessage } from './errors.js';
import { colorEnabled, createColors, type Colors, type Io } from './io.js';

export { CliError } from './errors.js';

export interface GlobalOptions {
  root?: string;
  config?: string;
  color?: boolean;
  quiet?: boolean;
}

export interface Context {
  io: Io;
  root: string;
  configPath: string;
  color: Colors;
  quiet: boolean;
}

export function createContext(opts: GlobalOptions, io: Io): Context {
  const root = path.resolve(io.cwd, opts.root ?? '.');
  const configPath = opts.config ? path.resolve(io.cwd, opts.config) : path.join(root, CONFIG_FILENAME);
  return { io, root, configPath, color: createColors(colorEnabled(io, opts.color)), quiet: opts.quiet === true };
}

export function displayPath(ctx: Context, file: string): string {
  const rel = path.relative(ctx.io.cwd, file);
  if (rel === '') return '.';
  return rel.startsWith('..') || path.isAbsolute(rel) ? file : rel;
}

export function baselineFile(ctx: Context): string {
  return path.join(ctx.root, BASELINE_PATH);
}

export function historyFile(ctx: Context): string {
  return path.join(ctx.root, HISTORY_PATH);
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
}

export async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

async function ensureRoot(ctx: Context): Promise<void> {
  let ok = false;
  try {
    ok = (await stat(ctx.root)).isDirectory();
  } catch {
    ok = false;
  }
  if (!ok) throw new CliError(`Root directory ${displayPath(ctx, ctx.root)} does not exist`);
}

export function formatIssue(issue: ValidationIssue): string {
  return `${issue.path === '' ? '(root)' : issue.path}: ${issue.message}`;
}

export type ConfigLoad = { ok: true; config: LegacyConfig } | { ok: false; issues: ValidationIssue[] };

export async function readConfig(ctx: Context): Promise<ConfigLoad> {
  await ensureRoot(ctx);
  let raw: string;
  try {
    raw = await readFile(ctx.configPath, 'utf8');
  } catch (err) {
    if (isNotFound(err)) {
      throw new CliError(`No config found at ${displayPath(ctx, ctx.configPath)}. Run "migration-tracker init" to create one.`);
    }
    throw new CliError(`Could not read ${displayPath(ctx, ctx.configPath)}: ${errorMessage(err)}`);
  }
  return toConfigLoad(raw);
}

function configOrThrow(result: ConfigLoad, label: string): LegacyConfig {
  if (!result.ok) {
    throw new CliError(`Invalid config ${label} (run "migration-tracker validate" for details)`, {
      details: result.issues.map(formatIssue),
    });
  }
  return result.config;
}

function toConfigLoad(raw: string): ConfigLoad {
  const result = parseConfig(raw);
  return result.ok ? { ok: true, config: result.config } : { ok: false, issues: result.issues };
}

export async function loadConfig(ctx: Context): Promise<LegacyConfig> {
  return configOrThrow(await readConfig(ctx), displayPath(ctx, ctx.configPath));
}

export function parseBaselineText(_ctx: Context | undefined, text: string, label: string): Baseline {
  try {
    return parseBaseline(text);
  } catch (err) {
    throw new CliError(`Invalid baseline ${label}: ${errorMessage(err)}`);
  }
}

export async function loadBaseline(ctx: Context): Promise<Baseline | undefined> {
  const file = baselineFile(ctx);
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw new CliError(`Could not read ${displayPath(ctx, file)}: ${errorMessage(err)}`);
  }
  const baseline = parseBaselineText(ctx, raw, displayPath(ctx, file));
  if (baseline.upgradedFrom === 1 && !upgradeWarned.has(ctx)) {
    upgradeWarned.add(ctx);
    if (!ctx.quiet) {
      ctx.io.stderr(
        `${ctx.color.yellow('⚠')} ${displayPath(ctx, file)} uses schemaVersion 1 site ids; run "migration-tracker baseline migrate" to upgrade it.\n`,
      );
    }
  }
  return baseline;
}

const upgradeWarned = new WeakSet<Context>();

export async function requireBaseline(ctx: Context): Promise<Baseline> {
  const baseline = await loadBaseline(ctx);
  if (!baseline) {
    throw new CliError(`No baseline found at ${displayPath(ctx, baselineFile(ctx))}. Run "migration-tracker baseline create" first.`);
  }
  return baseline;
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.generatedAt !== 'string') return false;
  if (typeof v.totals !== 'object' || v.totals === null || Array.isArray(v.totals)) return false;
  if (!Object.values(v.totals as Record<string, unknown>).every((n) => typeof n === 'number')) return false;
  if (v.revision !== undefined && (typeof v.revision !== 'object' || v.revision === null)) return false;
  return true;
}

export function parseHistoryText(raw: string, label: string, warn: (message: string) => void): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  raw.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = undefined;
    }
    if (isHistoryEntry(parsed)) entries.push(parsed);
    else warn(`${label}:${i + 1}: skipping malformed history entry`);
  });
  return entries;
}

export async function loadHistory(
  ctx: Context,
  warn: (message: string) => void,
  file: string = historyFile(ctx),
): Promise<HistoryEntry[]> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return [];
    throw new CliError(`Could not read ${displayPath(ctx, file)}: ${errorMessage(err)}`);
  }
  return parseHistoryText(raw, displayPath(ctx, file), warn);
}

export async function loadCodeowners(
  ctx: Context,
  option: string | false | undefined,
): Promise<{ file: string; rules: CodeownersRule[] } | undefined> {
  if (option === false) return undefined;
  if (option !== undefined) {
    const file = path.resolve(ctx.io.cwd, option);
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      if (isNotFound(err)) throw new CliError(`No CODEOWNERS file found at ${displayPath(ctx, file)}`);
      throw new CliError(`Could not read ${displayPath(ctx, file)}: ${errorMessage(err)}`);
    }
    return { file, rules: parseCodeowners(raw) };
  }
  for (const rel of CODEOWNERS_LOCATIONS) {
    const file = path.join(ctx.root, rel);
    try {
      return { file, rules: parseCodeowners(await readFile(file, 'utf8')) };
    } catch (err) {
      if (isNotFound(err) || (err as { code?: unknown }).code === 'EISDIR') continue;
      throw new CliError(`Could not read ${displayPath(ctx, file)}: ${errorMessage(err)}`);
    }
  }
  return undefined;
}

/** Synchronous CODEOWNERS auto-detection relative to root; undefined when none exists. */
export function loadCodeownersSync(root: string): CodeownersRule[] | undefined {
  for (const rel of CODEOWNERS_LOCATIONS) {
    let raw: string | undefined;
    try {
      raw = readFileSync(path.join(root, rel), 'utf8');
    } catch {
      raw = undefined;
    }
    if (raw !== undefined) return parseCodeowners(raw);
  }
  return undefined;
}

function readTextSync(file: string, label: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw new CliError(`Could not read ${label}: ${errorMessage(err)}`);
  }
}

/** Synchronous config load for the depcruise plugin; throws CliError when missing or invalid. */
export function loadConfigSync(configPath: string, label: string = configPath): LegacyConfig {
  const raw = readTextSync(configPath, label);
  if (raw === undefined) throw new CliError(`No config found at ${label}. Run "migration-tracker init" to create one.`);
  return configOrThrow(toConfigLoad(raw), label);
}

/** Synchronous baseline load; undefined when the file does not exist. */
export function loadBaselineSync(file: string, label: string = file): Baseline | undefined {
  const raw = readTextSync(file, label);
  return raw === undefined ? undefined : parseBaselineText(undefined, raw, label);
}

/** Synchronous history load; [] when the file does not exist. */
export function loadHistorySync(file: string, warn: (message: string) => void, label: string = file): HistoryEntry[] {
  const raw = readTextSync(file, label);
  return raw === undefined ? [] : parseHistoryText(raw, label, warn);
}

function withTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

export async function writeTextFile(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, withTrailingNewline(content), 'utf8');
}

export async function appendLine(file: string, line: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  let prefix = '';
  try {
    const current = await readFile(file, 'utf8');
    if (current !== '' && !current.endsWith('\n')) prefix = '\n';
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  await appendFile(file, `${prefix}${line}\n`, 'utf8');
}
