import type { ImportKind, ImportSite } from '@migration-tracker/core';

import { type DashboardGroup, type DashboardTotals, type SeriesSnapshot, siteKindOf } from './model';

export const DATA_ELEMENT_ID = 'migration-tracker-data';

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function countRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) if (isFiniteNumber(count)) out[key] = count;
  return out;
}

function fileCounts(value: unknown): Array<{ filePath: string; count: number }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (f): f is { filePath: string; count: number } =>
      isRecord(f) && typeof f.filePath === 'string' && isFiniteNumber(f.count),
  );
}

export function normalizeSite(input: Record<string, unknown>): ImportSite {
  const { occurrence: _occurrence, owners, ...rest } = input;
  const declared = isImportKind(rest.importKind) ? rest.importKind : 'import';
  const kinds = Array.isArray(rest.kinds) ? rest.kinds.filter(isImportKind) : [];
  const ownerList = Array.isArray(owners) ? owners.filter((o): o is string => typeof o === 'string') : [];
  return {
    ...(rest as unknown as ImportSite),
    importKind: siteKindOf(declared),
    kinds: kinds.length > 0 ? kinds : [declared],
    ...(ownerList.length > 0 ? { owners: ownerList } : {}),
  };
}

export function normalizeGroup(input: Record<string, unknown>): DashboardGroup {
  const {
    start,
    completePct,
    newSites,
    adoptionPct,
    byOwner,
    byDirectory,
    startHere,
    forecast: _forecast,
    target: _target,
    ...rest
  } = input;
  const g = rest as unknown as DashboardGroup;
  const owners = countRecord(byOwner);
  const directories = countRecord(byDirectory);
  const easy = fileCounts(startHere);
  return {
    ...g,
    old: Array.isArray(g.old) ? g.old : [],
    new: Array.isArray(g.new) ? g.new : [],
    byPackage: countRecord(g.byPackage) ?? {},
    topFiles: fileCounts(g.topFiles) ?? [],
    sites: isFiniteNumber(g.sites) ? g.sites : 0,
    files: isFiniteNumber(g.files) ? g.files : 0,
    ...(isFiniteNumber(start) ? { start } : {}),
    ...(isFiniteNumber(completePct) ? { completePct } : {}),
    ...(isFiniteNumber(newSites) ? { newSites } : {}),
    ...(isFiniteNumber(adoptionPct) || adoptionPct === null ? { adoptionPct } : {}),
    ...(owners ? { byOwner: owners } : {}),
    ...(directories ? { byDirectory: directories } : {}),
    ...(easy ? { startHere: easy } : {}),
  };
}

function normalizeTotals(input: unknown): DashboardTotals | undefined {
  if (!isRecord(input) || !isFiniteNumber(input.sites)) return undefined;
  const totals: DashboardTotals = { sites: input.sites };
  if (isFiniteNumber(input.start)) totals.start = input.start;
  if (isFiniteNumber(input.completePct)) totals.completePct = input.completePct;
  if (isFiniteNumber(input.newSites)) totals.newSites = input.newSites;
  if (isFiniteNumber(input.adoptionPct) || input.adoptionPct === null) totals.adoptionPct = input.adoptionPct;
  return totals;
}

export function normalizeSnapshot(input: unknown): SeriesSnapshot {
  if (!isRecord(input)) throw new Error('Report data is not a JSON object.');
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) {
    throw new Error(`Unsupported report schemaVersion ${JSON.stringify(input.schemaVersion)}; expected 1 or 2.`);
  }
  if (!Array.isArray(input.groups)) throw new Error('Report data has no "groups" array.');
  if (typeof input.generatedAt !== 'string') throw new Error('Report data has no "generatedAt" timestamp.');
  const upgraded = input.schemaVersion === 1;
  const { totals: rawTotals, sourceUrlTemplate, ...rest } = input;
  const snapshot = rest as unknown as SeriesSnapshot;
  const groups = (input.groups as unknown[]).filter(isRecord).map((g) => normalizeGroup(g));
  const totals = normalizeTotals(rawTotals);
  return {
    ...snapshot,
    schemaVersion: 2,
    ...(totals ? { totals } : {}),
    ...(typeof sourceUrlTemplate === 'string' && sourceUrlTemplate.trim() !== '' ? { sourceUrlTemplate } : {}),
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
