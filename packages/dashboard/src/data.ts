import type { ImportKind, ImportSite } from '@legacy-ratchet/core';

import { type SeriesSnapshot, siteKindOf } from './model';

export const DATA_ELEMENT_ID = 'legacy-ratchet-data';

export type LoadState =
  | { status: 'ready'; snapshot: SeriesSnapshot; sample?: boolean }
  | { status: 'missing' }
  | { status: 'invalid'; message: string };

const PLACEHOLDER_PATTERN = /^__[A-Z_]+__$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const IMPORT_KINDS: readonly ImportKind[] = ['import', 'require', 'dynamic-import', 'export-from', 'import-equals'];

function isImportKind(value: unknown): value is ImportKind {
  return typeof value === 'string' && (IMPORT_KINDS as readonly string[]).includes(value);
}

export function normalizeSite(input: Record<string, unknown>): ImportSite {
  const { occurrence: _occurrence, ...rest } = input;
  const declared = isImportKind(rest.importKind) ? rest.importKind : 'import';
  const kinds = Array.isArray(rest.kinds) ? rest.kinds.filter(isImportKind) : [];
  return {
    ...(rest as unknown as ImportSite),
    importKind: siteKindOf(declared),
    kinds: kinds.length > 0 ? kinds : [declared],
  };
}

export function normalizeSnapshot(input: unknown): SeriesSnapshot {
  if (!isRecord(input)) throw new Error('Report data is not a JSON object.');
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) {
    throw new Error(`Unsupported report schemaVersion ${JSON.stringify(input.schemaVersion)}; expected 1 or 2.`);
  }
  if (!Array.isArray(input.groups)) throw new Error('Report data has no "groups" array.');
  if (typeof input.generatedAt !== 'string') throw new Error('Report data has no "generatedAt" timestamp.');
  const upgraded = input.schemaVersion === 1;
  const snapshot = input as unknown as SeriesSnapshot;
  const groups = snapshot.groups.map((g) => ({
    ...g,
    old: Array.isArray(g.old) ? g.old : [],
    new: Array.isArray(g.new) ? g.new : [],
    byPackage: isRecord(g.byPackage) ? g.byPackage : {},
    topFiles: Array.isArray(g.topFiles) ? g.topFiles : [],
    sites: typeof g.sites === 'number' ? g.sites : 0,
    files: typeof g.files === 'number' ? g.files : 0,
  }));
  return {
    ...snapshot,
    schemaVersion: 2,
    ...(upgraded ? { upgradedFrom: 1 as const } : {}),
    groups,
    sites: Array.isArray(snapshot.sites)
      ? (snapshot.sites as unknown[]).filter(isRecord).map((s) => normalizeSite(s))
      : [],
    history: Array.isArray(snapshot.history) ? snapshot.history.filter((h) => isRecord(h) && isRecord(h.totals)) : [],
    totalSites:
      typeof snapshot.totalSites === 'number' ? snapshot.totalSites : groups.reduce((sum, g) => sum + g.sites, 0),
  };
}

export function parseSnapshotText(text: string | null | undefined): LoadState {
  const trimmed = (text ?? '').trim();
  if (trimmed === '' || PLACEHOLDER_PATTERN.test(trimmed)) return { status: 'missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { status: 'invalid', message: `Report data is not valid JSON (${(error as Error).message}).` };
  }
  try {
    return { status: 'ready', snapshot: normalizeSnapshot(parsed) };
  } catch (error) {
    return { status: 'invalid', message: (error as Error).message };
  }
}

export function readSnapshot(doc: Document = document): LoadState {
  const el = doc.getElementById(DATA_ELEMENT_ID);
  if (!el) return { status: 'missing' };
  return parseSnapshotText(el.textContent);
}
