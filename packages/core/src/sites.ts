import { fingerprint, normalizePath, siteId, siteKindOf } from './identity.js';
import { findGroup } from './match.js';
import type { ImportKind, ImportSite, InlineSuppression, LegacyConfig, RawImport, SiteKind } from './types.js';
import { compareStrings } from './util.js';

interface SiteGroup {
  id: string;
  groupId: string;
  packageName: string;
  filePath: string;
  importKind: SiteKind;
  moduleSpecifier: string;
  raws: RawImport[];
}

export function suppressesGroup(s: InlineSuppression | undefined, groupId: string): boolean {
  if (!s || s.reason.trim() === '') return false;
  return s.groupIds.length === 0 || s.groupIds.includes(groupId);
}

function copySuppression(s: InlineSuppression): InlineSuppression {
  return { groupIds: [...s.groupIds], reason: s.reason };
}

function compareOptional(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

function comparePosition(a: RawImport, b: RawImport): number {
  return compareOptional(a.line, b.line) || compareOptional(a.column, b.column);
}

function buildSite(g: SiteGroup): ImportSite {
  const raws = [...g.raws].sort(comparePosition);
  const kinds = [...new Set<ImportKind>(raws.map((r) => r.importKind))].sort(compareStrings);
  const site: ImportSite = {
    id: g.id,
    groupId: g.groupId,
    filePath: g.filePath,
    packageName: g.packageName,
    moduleSpecifier: g.moduleSpecifier,
    importKind: g.importKind,
    kinds,
    typeOnly: raws.every((r) => r.typeOnly),
    sourceFingerprint: fingerprint(g.importKind, g.moduleSpecifier),
  };
  if (raws.every((r) => r.line !== undefined)) site.occurrences = raws.length;

  const located = raws.filter((r) => r.line !== undefined);
  const position = located.find((r) => !suppressesGroup(r.suppression, g.groupId)) ?? located[0];
  if (position) {
    site.line = position.line;
    if (position.column !== undefined) site.column = position.column;
  }

  const first = raws[0];
  if (first?.suppression && raws.every((r) => suppressesGroup(r.suppression, g.groupId))) {
    site.suppression = copySuppression(first.suppression);
  } else {
    const missingReason = raws.find((r) => r.suppression !== undefined && r.suppression.reason.trim() === '');
    if (missingReason?.suppression) site.suppression = copySuppression(missingReason.suppression);
  }
  return site;
}

export function collectSites(config: LegacyConfig, raw: readonly RawImport[]): ImportSite[] {
  const groups = new Map<string, SiteGroup>();
  for (const r of raw) {
    const found = findGroup(config, r.moduleSpecifier);
    if (!found) continue;
    const filePath = normalizePath(r.filePath);
    const importKind = siteKindOf(r.importKind);
    const id = siteId({ groupId: found.groupId, filePath, importKind, moduleSpecifier: r.moduleSpecifier });
    const existing = groups.get(id);
    if (existing) {
      existing.raws.push(r);
    } else {
      groups.set(id, { id, ...found, filePath, importKind, moduleSpecifier: r.moduleSpecifier, raws: [r] });
    }
  }
  return [...groups.values()].sort((a, b) => compareStrings(a.id, b.id)).map(buildSite);
}

export function enrichSites(
  base: readonly ImportSite[],
  located: readonly ImportSite[],
): { sites: ImportSite[]; unlocated: ImportSite[]; extra: string[] } {
  const byId = new Map(located.map((s) => [s.id, s]));
  const baseIds = new Set(base.map((s) => s.id));
  const sites: ImportSite[] = [];
  const unlocated: ImportSite[] = [];
  for (const b of base) {
    const match = byId.get(b.id);
    if (!match) {
      unlocated.push(b);
      sites.push(b);
      continue;
    }
    const site: ImportSite = {
      id: b.id,
      groupId: b.groupId,
      filePath: b.filePath,
      packageName: b.packageName,
      moduleSpecifier: b.moduleSpecifier,
      importKind: b.importKind,
      kinds: [...match.kinds],
      typeOnly: match.typeOnly,
      sourceFingerprint: b.sourceFingerprint,
    };
    if (match.occurrences !== undefined) site.occurrences = match.occurrences;
    if (match.line !== undefined) site.line = match.line;
    if (match.column !== undefined) site.column = match.column;
    if (match.suppression) site.suppression = copySuppression(match.suppression);
    sites.push(site);
  }
  const extra = [...byId.keys()].filter((id) => !baseIds.has(id)).sort(compareStrings);
  return { sites, unlocated, extra };
}
