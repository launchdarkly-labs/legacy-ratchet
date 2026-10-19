import {
  collectAdoption,
  collectSites,
  enrichSites,
  newPackages,
  type AdoptionCount,
  type ImportSite,
  type LegacyConfig,
  type RawImport,
} from '@legacy-ratchet/core';
import { engineVersion, extractWithDepcruise, type ExtractOptions, type ExtractResult } from '@legacy-ratchet/depcruise';
import { listFiles, scanFiles, scanFilesAt, SCANNER_VERSION, type ScanError } from '@legacy-ratchet/scanner';
import { CliError } from './errors.js';
import { changedFiles } from './git.js';
import type { Context } from './load.js';

export type Engine = 'depcruise' | 'scanner';
export const ENGINES: readonly Engine[] = ['depcruise', 'scanner'];
export const DEFAULT_ENGINE: Engine = 'depcruise';

export interface ProjectScan {
  sites: ImportSite[];
  fileCount: number;
  errors: ScanError[];
  warnings: string[];
  unlocated: ImportSite[];
  engine: Engine;
  engineVersion?: string;
  changed?: { ref: string; files: string[] };
  adoption?: AdoptionCount[];
}

export interface EngineOptions {
  engine?: Engine;
  depcruiseConfig?: string;
  tsConfig?: string;
  cache?: string | false;
  prefilter?: boolean;
}

export interface ScanProjectOptions extends EngineOptions {
  changedSince?: string;
  ignore?: readonly string[];
  extract?: (opts: ExtractOptions) => Promise<ExtractResult>;
  adoption?: boolean;
}

export { unlocatedWarning } from './format/types.js';
export { restrictBaseline } from './outcome.js';

export function scannerVersionFor(scan: Pick<ProjectScan, 'engine' | 'engineVersion'>): string {
  return scan.engine === 'depcruise' && scan.engineVersion ? `${SCANNER_VERSION}+${scan.engineVersion}` : SCANNER_VERSION;
}

export function legacyPackages(config: LegacyConfig): string[] {
  const names = new Set<string>();
  for (const group of Object.values(config.groups)) for (const p of group.old) if (p !== '') names.add(p);
  return [...names].sort();
}

export function prefilterPackages(config: LegacyConfig, adoption: boolean): string[] {
  if (!adoption) return legacyPackages(config);
  return [...new Set([...legacyPackages(config), ...newPackages(config)])].sort();
}

function adoptionOf(config: LegacyConfig, imports: readonly RawImport[], opts: ScanProjectOptions): { adoption?: AdoptionCount[] } {
  return opts.adoption ? { adoption: collectAdoption(config, imports) } : {};
}

export async function scanProject(ctx: Context, config: LegacyConfig, opts: ScanProjectOptions = {}): Promise<ProjectScan> {
  const ignore = [...(config.ignore ?? []), ...(opts.ignore ?? [])];
  let files: string[] | undefined;
  let changed: { ref: string; files: string[] } | undefined;
  if (opts.changedSince !== undefined) {
    const candidates = await changedFiles(ctx.root, opts.changedSince);
    files = await listFiles({ root: ctx.root, ignore, files: candidates });
    changed = { ref: opts.changedSince, files };
  }
  const scan =
    (opts.engine ?? DEFAULT_ENGINE) === 'scanner'
      ? await scanWithScanner(ctx, config, ignore, files, opts)
      : await scanWithDepcruise(ctx, config, ignore, files, opts);
  return changed ? { ...scan, changed } : scan;
}

async function scanWithScanner(
  ctx: Context,
  config: LegacyConfig,
  ignore: readonly string[],
  files: string[] | undefined,
  opts: ScanProjectOptions,
): Promise<ProjectScan> {
  const result =
    files === undefined
      ? await scanFiles({ root: ctx.root, ignore })
      : files.length === 0
        ? { imports: [], files: 0, errors: [] }
        : await scanFilesAt(ctx.root, files);
  return {
    sites: collectSites(config, result.imports),
    fileCount: result.files,
    errors: sortErrors(result.errors),
    warnings: [],
    unlocated: [],
    engine: 'scanner',
    ...adoptionOf(config, result.imports, opts),
  };
}

async function scanWithDepcruise(
  ctx: Context,
  config: LegacyConfig,
  ignore: readonly string[],
  files: string[] | undefined,
  opts: ScanProjectOptions,
): Promise<ProjectScan> {
  const listed = files ?? (await listFiles({ root: ctx.root, ignore }));
  const prefilter = opts.prefilter === false ? undefined : prefilterPackages(config, opts.adoption === true);
  if (listed.length === 0 || prefilter?.length === 0) {
    return {
      sites: [],
      fileCount: listed.length,
      errors: [],
      warnings: [],
      unlocated: [],
      engine: 'depcruise',
      engineVersion: engineVersion(),
      ...adoptionOf(config, [], opts),
    };
  }
  const extractOpts: ExtractOptions = { root: ctx.root, ignore };
  if (files !== undefined) extractOpts.files = files;
  if (opts.tsConfig !== undefined) extractOpts.tsConfig = opts.tsConfig;
  if (opts.depcruiseConfig !== undefined) extractOpts.depcruiseConfig = opts.depcruiseConfig;
  if (opts.cache !== undefined) extractOpts.cache = opts.cache;
  if (prefilter !== undefined) extractOpts.prefilter = prefilter;

  const extracted = await (opts.extract ?? extractWithDepcruise)(extractOpts);
  if (extracted.errors.length > 0) {
    throw new CliError('dependency-cruiser could not extract imports, so nothing was checked', {
      details: extracted.errors.map((e) => `${e.filePath}: ${e.message}`),
    });
  }

  const base = collectSites(config, extracted.imports);
  const flagged = [...new Set(base.map((s) => s.filePath))].sort();
  const located = flagged.length === 0 ? { imports: [], files: 0, errors: [] } : await scanFilesAt(ctx.root, flagged);
  const { sites, unlocated } = enrichSites(base, collectSites(config, located.imports));
  const unreadable = new Set(located.errors.map((e) => e.filePath));
  return {
    sites,
    fileCount: listed.length,
    errors: sortErrors(located.errors),
    warnings: [...extracted.warnings],
    unlocated: unlocated.filter((s) => !unreadable.has(s.filePath)),
    engine: 'depcruise',
    engineVersion: extracted.engineVersion,
    ...adoptionOf(config, extracted.imports, opts),
  };
}

function sortErrors(errors: readonly ScanError[]): ScanError[] {
  return [...errors].sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));
}
