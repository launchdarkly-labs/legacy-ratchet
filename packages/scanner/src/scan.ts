import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RawImport } from '@migration-tracker/core';
import { listFiles } from './files.js';
import { scanSource } from './parse.js';

export interface ScanFilesOptions {
  root: string;
  ignore?: readonly string[];
  files?: readonly string[];
  concurrency?: number;
}

export interface ScanError {
  filePath: string;
  message: string;
}

export interface ScanFilesResult {
  imports: RawImport[];
  files: number;
  errors: ScanError[];
}

export const DEFAULT_CONCURRENCY = 32;

/**
 * Reads and scans the given repo-relative paths with bounded concurrency.
 * Output order follows `relPaths`, independent of completion order.
 * Exported for tests; not part of the public index.
 */
export async function scanPaths(
  root: string,
  relPaths: readonly string[],
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<ScanFilesResult> {
  const limit = Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : DEFAULT_CONCURRENCY));
  const perFile: Array<{ imports: RawImport[] } | { error: ScanError }> = new Array(relPaths.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < relPaths.length) {
      const i = next++;
      const rel = relPaths[i]!;
      try {
        const code = await readFile(path.join(root, rel), 'utf8');
        perFile[i] = { imports: scanSource(code, rel) };
      } catch (err) {
        perFile[i] = { error: { filePath: rel, message: err instanceof Error ? err.message : String(err) } };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, relPaths.length) }, worker));

  const imports: RawImport[] = [];
  const errors: ScanError[] = [];
  for (const r of perFile) {
    if ('error' in r) errors.push(r.error);
    else imports.push(...r.imports);
  }
  return { imports, files: relPaths.length, errors };
}

/** Scans the given repo-relative paths (no listing or ignore filtering). */
export function scanFilesAt(root: string, files: readonly string[]): Promise<ScanFilesResult> {
  return scanPaths(root, files);
}

/** Lists files under `root` (see `listFiles`) and scans each one. */
export async function scanFiles(opts: ScanFilesOptions): Promise<ScanFilesResult> {
  const listOpts: { root: string; ignore?: readonly string[]; files?: readonly string[] } = { root: opts.root };
  if (opts.ignore) listOpts.ignore = opts.ignore;
  if (opts.files) listOpts.files = opts.files;
  const relPaths = await listFiles(listOpts);
  return scanPaths(opts.root, relPaths, opts.concurrency);
}
