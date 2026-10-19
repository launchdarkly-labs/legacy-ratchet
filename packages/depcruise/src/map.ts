import { isIgnoredPath, normalizePath } from '@legacy-ratchet/core';
import type { ImportKind, RawImport } from '@legacy-ratchet/core';
import { DEFAULT_EXTENSIONS, DEFAULT_IGNORE } from '@legacy-ratchet/scanner';
import type { DependencyType, ICruiseResult, IDependency, IModule } from 'dependency-cruiser';
import path from 'node:path';

export interface MapOptions {
  root: string;
  baseDir: string;
  files?: ReadonlySet<string>;
  ignore: readonly string[];
}

export interface MapResult {
  imports: RawImport[];
  files: string[];
  skipped: Array<{ filePath: string; reason: string }>;
}

const SKIPPED_DEPENDENCY_TYPES: ReadonlySet<DependencyType> = new Set<DependencyType>([
  'type-import',
  'triple-slash-amd-dependency',
  'triple-slash-directive',
  'triple-slash-file-reference',
  'triple-slash-type-reference',
  'jsdoc',
  'jsdoc-bracket-import',
  'jsdoc-import-tag',
  'exotic-require',
  'amd-define',
  'amd-require',
  'amd-exotic-require',
  'process-get-builtin-module',
]);

const JS_ISH_PROTOCOLS: ReadonlySet<string> = new Set(['node:', 'bun:']);

const DECLARATION_FILE = /\.d\.[cm]?ts$/;

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

export function rawKindOf(dep: IDependency): ImportKind | undefined {
  if (dep.moduleSystem === 'amd' || dep.moduleSystem === 'tsd') return undefined;
  const types = dep.dependencyTypes ?? [];
  if (types.some((t) => SKIPPED_DEPENDENCY_TYPES.has(t))) return undefined;
  if (dep.exoticallyRequired) return undefined;
  if (types.includes('import-equals')) return 'import-equals';
  if (types.includes('export')) return 'export-from';
  if (types.includes('dynamic-import') || dep.dynamic) return 'dynamic-import';
  if (types.includes('require')) return 'require';
  if (types.includes('import')) return 'import';
  if (dep.moduleSystem === 'es6') return 'import';
  if (dep.moduleSystem === 'cjs') return 'require';
  return undefined;
}

function specifierOf(dep: IDependency): string {
  const protocol = dep.protocol as string | undefined;
  if (protocol && JS_ISH_PROTOCOLS.has(protocol) && !dep.module.startsWith(protocol)) {
    return `${protocol}${dep.module}`;
  }
  return dep.module;
}

function rebase(source: string, baseDir: string, root: string): string | undefined {
  const src = toPosix(source);
  const base = toPosix(baseDir);
  const absolute = path.posix.isAbsolute(src) || path.win32.isAbsolute(source) ? src : path.posix.join(base, src);
  const rel = normalizePath(absolute, toPosix(root));
  if (rel === '' || rel === '..' || rel.startsWith('../') || rel.startsWith('/') || /^[A-Za-z]:\//.test(rel)) {
    return undefined;
  }
  return rel;
}

function moduleSkipReason(mod: IModule, rel: string | undefined, opts: MapOptions): string | undefined {
  if (mod.coreModule) return 'core module';
  if (mod.couldNotResolve) return 'could not resolve';
  if (rel === undefined) return 'outside root';
  if (/(^|\/)node_modules\//.test(rel)) return 'under node_modules';
  if (DECLARATION_FILE.test(rel)) return 'declaration file';
  if (!DEFAULT_EXTENSIONS.some((ext) => rel.endsWith(ext))) return 'unsupported extension';
  if (isIgnoredPath({ ignore: [...DEFAULT_IGNORE] }, rel, opts.ignore)) return 'ignored';
  if (opts.files && !opts.files.has(rel)) return 'not in file list';
  return undefined;
}

export function fromCruiseResult(result: ICruiseResult, opts: MapOptions): MapResult {
  const byFile = new Map<string, IDependency[]>();
  const skipped: MapResult['skipped'] = [];
  const skippedSeen = new Set<string>();

  for (const mod of result.modules) {
    const rel = rebase(mod.source, opts.baseDir, opts.root);
    const reason = moduleSkipReason(mod, rel, opts);
    if (reason !== undefined || rel === undefined) {
      const filePath = rel ?? toPosix(mod.source);
      const key = `${filePath}\u0000${reason}`;
      if (!skippedSeen.has(key)) {
        skippedSeen.add(key);
        skipped.push({ filePath, reason: reason ?? 'outside root' });
      }
      continue;
    }
    const deps = byFile.get(rel);
    if (deps) deps.push(...mod.dependencies);
    else byFile.set(rel, [...mod.dependencies]);
  }

  const files = [...byFile.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const imports: RawImport[] = [];
  for (const filePath of files) {
    const seen = new Set<string>();
    for (const dep of byFile.get(filePath)!) {
      const importKind = rawKindOf(dep);
      if (importKind === undefined) continue;
      const moduleSpecifier = specifierOf(dep);
      const typeOnly = (dep.dependencyTypes ?? []).includes('type-only');
      const key = `${moduleSpecifier}\u0000${importKind}\u0000${typeOnly}`;
      if (seen.has(key)) continue;
      seen.add(key);
      imports.push({ filePath, moduleSpecifier, importKind, typeOnly });
    }
  }

  return { imports, files, skipped };
}
