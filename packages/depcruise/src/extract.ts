import type { RawImport } from '@migration-tracker/core';
import { listFiles } from '@migration-tracker/scanner';
import type { ICruiseOptions, ICruiseResult } from 'dependency-cruiser';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { fromCruiseResult } from './map.js';

export interface ExtractOptions {
  root: string;
  ignore?: readonly string[];
  files?: readonly string[];
  tsConfig?: string;
  depcruiseConfig?: string;
  cache?: string | false;
  prefilter?: readonly string[];
}

export interface ExtractError {
  filePath: string;
  message: string;
}

export interface ExtractResult {
  imports: RawImport[];
  files: string[];
  errors: ExtractError[];
  warnings: string[];
  engineVersion: string;
}

export interface BuildCruiseContext {
  root: string;
  cache?: string | false;
}

type IExcludeType = Exclude<NonNullable<ICruiseOptions['exclude']>, string | string[]>;

export const NODE_MODULES_SAMPLE = 'node_modules/x/dist/index.js';

export const PARSE_ERROR_HINT = 'add an ignore glob or use --engine scanner';

export const TYPESCRIPT_UNAVAILABLE_WARNING =
  'dependency-cruiser cannot load typescript; type-only and import-equals detection is degraded — ' +
  'install typescript where dependency-cruiser can resolve it (e.g. pnpm public-hoist-pattern)';

export function typescriptAvailable(transpilers: ReadonlyArray<{ name: string; available: boolean }>): boolean {
  return transpilers.some((t) => t.name === 'typescript' && t.available);
}

const DROPPED_FILTERS = ['includeOnly', 'focus', 'reaches', 'collapse', 'affected'] as const;

const UNSUPPORTED_CONFIGS = ['webpackConfig', 'babelConfig'] as const;

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function excludeAsObject(exclude: ICruiseOptions['exclude']): IExcludeType {
  if (exclude === undefined) return {};
  if (typeof exclude === 'string' || Array.isArray(exclude)) return { path: exclude };
  return { ...exclude };
}

function sanitizeExclude(user: ICruiseOptions['exclude'], warnings: string[]): IExcludeType | undefined {
  const exclude = excludeAsObject(user);
  const result: IExcludeType = {};
  const paths = toArray(exclude.path);
  if (paths.length > 0) {
    const matchesNodeModules = paths.some((p) => new RegExp(p).test(NODE_MODULES_SAMPLE));
    if (matchesNodeModules) {
      warnings.push(
        `depcruise exclude.path matches "${NODE_MODULES_SAMPLE}", which would drop imports of installed packages; ` +
          'it is applied to local files only',
      );
      result.path = paths.map((p) => `^(?!.*node_modules/).*?(?:${p})`);
    } else {
      result.path = paths;
    }
  }
  if (exclude.dynamic !== undefined) {
    warnings.push('depcruise exclude.dynamic is ignored: dynamic imports are legacy imports too');
  }
  return result.path ? result : undefined;
}

export function buildCruiseOptions(
  user: Partial<ICruiseOptions> | undefined,
  ctx: BuildCruiseContext,
): { options: ICruiseOptions; warnings: string[] } {
  const u: Partial<ICruiseOptions> = user ?? {};
  const warnings: string[] = [];

  for (const key of DROPPED_FILTERS) {
    if (u[key] !== undefined) {
      warnings.push(`depcruise option "${key}" is ignored: migration-tracker needs every import of every listed file`);
    }
  }
  for (const key of UNSUPPORTED_CONFIGS) {
    if (u[key] !== undefined) {
      warnings.push(`depcruise option "${key}" is ignored by the migration-tracker engine`);
    }
  }

  const options: ICruiseOptions = {
    validate: false,
    tsPreCompilationDeps: true,
    parser: u.parser ?? 'tsc',
    moduleSystems: ['es6', 'cjs'],
    detectJSDocImports: false,
    detectProcessBuiltinModuleCalls: false,
    doNotFollow: { path: '.' },
    maxDepth: 1,
    baseDir: ctx.root,
  };

  const exclude = sanitizeExclude(u.exclude, warnings);
  if (exclude) options.exclude = exclude;
  if (u.tsConfig !== undefined) options.tsConfig = { ...u.tsConfig };
  if (u.enhancedResolveOptions !== undefined)
    options.enhancedResolveOptions = structuredClone(u.enhancedResolveOptions);
  if (u.externalModuleResolutionStrategy !== undefined) {
    options.externalModuleResolutionStrategy = u.externalModuleResolutionStrategy;
  }
  if (u.preserveSymlinks !== undefined) options.preserveSymlinks = u.preserveSymlinks;
  if (u.combinedDependencies !== undefined) options.combinedDependencies = u.combinedDependencies;
  if (u.builtInModules !== undefined) options.builtInModules = structuredClone(u.builtInModules);

  if (ctx.cache !== false) {
    options.cache = {
      folder: ctx.cache ?? path.join(ctx.root, '.cache/migration-tracker/depcruise'),
      strategy: 'content',
    };
  } else {
    options.cache = false;
  }

  return { options, warnings };
}

let cachedEngineVersion: string | undefined;

export function engineVersion(): string {
  if (cachedEngineVersion !== undefined) return cachedEngineVersion;
  const require = createRequire(import.meta.url);
  let version = 'unknown';
  for (const dir of require.resolve.paths('dependency-cruiser') ?? []) {
    const manifest = path.join(dir, 'dependency-cruiser', 'package.json');
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown };
    if (typeof parsed.version === 'string') version = parsed.version;
    break;
  }
  cachedEngineVersion = `dependency-cruiser@${version}`;
  return cachedEngineVersion;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

export function parseFailedFile(message: string, root: string): string | undefined {
  const match = /\.\.\. in (.+?)\s*$/m.exec(message);
  if (!match?.[1]) return undefined;
  const file = match[1].trim();
  const rel = path.isAbsolute(file) ? path.relative(root, file) : file;
  return toPosix(rel);
}

function firstLine(message: string): string {
  const inner = /ran afoul of\.\.\.\s*\n\s*(.+)/.exec(message);
  return (inner?.[1] ?? message.split('\n')[0] ?? message).trim();
}

const PREFILTER_CONCURRENCY = 32;

async function prefilterFiles(root: string, files: readonly string[], needles: readonly string[]): Promise<string[]> {
  const keep: boolean[] = new Array(files.length).fill(false);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const i = next++;
      try {
        const text = await readFile(path.join(root, files[i]!), 'utf8');
        keep[i] = needles.some((n) => text.includes(n));
      } catch {
        keep[i] = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREFILTER_CONCURRENCY, files.length) }, worker));
  return files.filter((_, i) => keep[i]);
}

function resolveFrom(root: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(root, p);
}

function sameDirectory(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

export async function extractWithDepcruise(opts: ExtractOptions): Promise<ExtractResult> {
  const root = realpathSync(path.resolve(opts.root));
  const ignore = opts.ignore ?? [];
  const warnings: string[] = [];
  const empty = (files: string[] = [], errors: ExtractError[] = []): ExtractResult => ({
    imports: [],
    files,
    errors,
    warnings,
    engineVersion: engineVersion(),
  });

  const listOpts: { root: string; ignore?: readonly string[]; files?: readonly string[] } = { root };
  if (ignore.length > 0) listOpts.ignore = ignore;
  if (opts.files) listOpts.files = opts.files;
  let files = await listFiles(listOpts);

  if (opts.prefilter && opts.prefilter.length > 0) {
    files = await prefilterFiles(root, files, opts.prefilter);
  }
  if (files.length === 0) return empty();

  let userOptions: Partial<ICruiseOptions> | undefined;
  if (opts.depcruiseConfig) {
    const { default: extractDepcruiseConfig } = await import('dependency-cruiser/config-utl/extract-depcruise-config');
    const configPath = resolveFrom(root, opts.depcruiseConfig);
    const config = await extractDepcruiseConfig(configPath, new Set(), path.dirname(configPath));
    userOptions = config.options;
  }

  let cache = opts.cache;
  if (cache !== false && !sameDirectory(process.cwd(), root)) {
    warnings.push(
      'depcruise cache disabled: its content strategy checks freshness against process.cwd(), which is not the project root',
    );
    cache = false;
  }
  const ctx: BuildCruiseContext = { root };
  if (cache !== undefined) ctx.cache = typeof cache === 'string' ? resolveFrom(root, cache) : cache;
  const built = buildCruiseOptions(userOptions, ctx);
  warnings.push(...built.warnings);
  const options = built.options;

  const tsConfigFile = opts.tsConfig ?? userOptions?.tsConfig?.fileName;
  let transpileOptions: { tsConfig?: unknown } | undefined;
  if (tsConfigFile) {
    const { default: extractTSConfig } = await import('dependency-cruiser/config-utl/extract-ts-config');
    const fileName = resolveFrom(root, tsConfigFile);
    options.tsConfig = { fileName };
    transpileOptions = { tsConfig: extractTSConfig(fileName) };
  } else {
    delete options.tsConfig;
  }

  const { cruise, getAvailableTranspilers } = await import('dependency-cruiser');
  if (!typescriptAvailable(getAvailableTranspilers())) warnings.push(TYPESCRIPT_UNAVAILABLE_WARNING);
  let output: ICruiseResult;
  try {
    const result = await cruise(files, options, undefined, transpileOptions);
    if (typeof result.output === 'string') {
      throw new Error('dependency-cruiser returned a string; expected a cruise result object');
    }
    output = result.output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const filePath = parseFailedFile(message, root);
    if (filePath === undefined) throw err;
    return empty(files, [
      {
        filePath,
        message: `${firstLine(message)} (dependency-cruiser stops the whole run on one bad file; ${PARSE_ERROR_HINT})`,
      },
    ]);
  }

  const mapped = fromCruiseResult(output, { root, baseDir: root, files: new Set(files), ignore });
  return {
    imports: mapped.imports,
    files: mapped.files,
    errors: [],
    warnings,
    engineVersion: engineVersion(),
  };
}
