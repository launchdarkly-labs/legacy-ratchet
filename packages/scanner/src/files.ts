import path from 'node:path';
import fg from 'fast-glob';
import { DEFAULT_EXTENSIONS, DEFAULT_IGNORE } from './constants.js';

export interface ListFilesOptions {
  root: string;
  ignore?: readonly string[];
  files?: readonly string[];
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Normalizes a caller-supplied path to repo-relative POSIX; undefined if it escapes root. */
export function normalizeInputPath(root: string, p: string): string | undefined {
  let rel = toPosix(p);
  if (path.isAbsolute(p) || path.win32.isAbsolute(p)) {
    rel = toPosix(path.relative(root, p));
  }
  rel = path.posix.normalize(rel);
  while (rel.startsWith('./')) rel = rel.slice(2);
  if (rel === '' || rel === '.' || rel === '..' || rel.startsWith('../') || path.posix.isAbsolute(rel)) {
    return undefined;
  }
  return rel;
}

function hasDefaultExtension(p: string): boolean {
  return DEFAULT_EXTENSIONS.some((ext) => p.endsWith(ext));
}

/**
 * Lists scannable source files under `root` as sorted repo-relative POSIX
 * paths. With `files`, only those paths are considered (they must exist,
 * have a default extension and not be ignored); the repo is not walked.
 */
export async function listFiles(opts: ListFilesOptions): Promise<string[]> {
  const ignore = [...new Set([...DEFAULT_IGNORE, ...(opts.ignore ?? [])])];
  const base = {
    cwd: opts.root,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    ignore,
  } as const;

  let patterns: string[];
  if (opts.files) {
    const wanted = new Set<string>();
    for (const f of opts.files) {
      const rel = normalizeInputPath(opts.root, f);
      if (rel && hasDefaultExtension(rel)) wanted.add(rel);
    }
    if (wanted.size === 0) return [];
    patterns = [...wanted].map((p) => fg.escapePath(p));
  } else {
    const exts = DEFAULT_EXTENSIONS.map((e) => e.slice(1)).join(',');
    patterns = [`**/*.{${exts}}`];
  }

  const found = await fg(patterns, base);
  const result = [...new Set(found.map(toPosix))].filter(hasDefaultExtension);
  result.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return result;
}
