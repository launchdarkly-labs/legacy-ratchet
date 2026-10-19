import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  BASELINE_PATH,
  CONFIG_FILENAME,
  parseBaseline,
  parseConfig,
  type Baseline,
  type LegacyConfig,
  type ValidationIssue,
} from '@migration-tracker/core';

export interface RuleOptions {
  configPath?: string;
  baselinePath?: string;
  root?: string;
}

export type ProjectState =
  | { kind: 'invalid-config'; root: string; configPath: string; issues: ValidationIssue[] }
  | { kind: 'invalid-baseline'; root: string; config: LegacyConfig; baselinePath: string; message: string }
  | { kind: 'ok'; root: string; config: LegacyConfig; baseline: Baseline | undefined };

interface CacheEntry<T> {
  mtimeMs: number;
  size: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Reads and parses `file`, reusing the previous result while its mtime and
 * size are unchanged. Returns undefined when the file does not exist.
 */
function readCached<T>(file: string, parse: (text: string) => T): T | undefined {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    cache.delete(file);
    return undefined;
  }
  if (!stat.isFile()) return undefined;
  const hit = cache.get(file) as CacheEntry<T> | undefined;
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.value;
  const value = parse(readFileSync(file, 'utf8'));
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value });
  return value;
}

/** Clears the config/baseline cache (tests). */
export function clearCache(): void {
  cache.clear();
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Nearest directory at or above `startDir` containing `migrations.json`. */
export function findRoot(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    if (isFile(path.join(dir, CONFIG_FILENAME))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Resolves root and config path for a linted file:
 * - `root` option (relative to `cwd`): config = `configPath` relative to root, default `migrations.json`.
 * - else `configPath` option (relative to `cwd`): root = the config file's directory.
 * - else walk up from the file to the nearest `migrations.json`.
 */
export function resolveLocation(
  filename: string,
  cwd: string,
  options: RuleOptions,
): { root: string; configPath: string } | undefined {
  if (options.root !== undefined) {
    const root = path.resolve(cwd, options.root);
    return { root, configPath: path.resolve(root, options.configPath ?? CONFIG_FILENAME) };
  }
  if (options.configPath !== undefined) {
    const configPath = path.resolve(cwd, options.configPath);
    return { root: path.dirname(configPath), configPath };
  }
  const root = findRoot(path.dirname(filename));
  return root === undefined ? undefined : { root, configPath: path.join(root, CONFIG_FILENAME) };
}

type BaselineRead = { ok: true; baseline: Baseline } | { ok: false; message: string };

function readBaseline(text: string): BaselineRead {
  try {
    return { ok: true, baseline: parseBaseline(text) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Loads config + baseline for the file. Undefined means "no migrations.json":
 * the rule is a no-op. A missing baseline yields `baseline: undefined`.
 */
export function loadProject(filename: string, cwd: string, options: RuleOptions): ProjectState | undefined {
  const loc = resolveLocation(filename, cwd, options);
  if (!loc) return undefined;
  const result = readCached(loc.configPath, parseConfig);
  if (!result) return undefined;
  if (!result.ok) return { kind: 'invalid-config', root: loc.root, configPath: loc.configPath, issues: result.issues };
  const baselinePath = path.resolve(loc.root, options.baselinePath ?? BASELINE_PATH);
  const baseline = readCached(baselinePath, readBaseline);
  if (baseline && !baseline.ok) {
    return { kind: 'invalid-baseline', root: loc.root, config: result.config, baselinePath, message: baseline.message };
  }
  return { kind: 'ok', root: loc.root, config: result.config, baseline: baseline?.baseline };
}
