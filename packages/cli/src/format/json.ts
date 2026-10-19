import type { ExpiredException, ImportSite } from '@migration-tracker/core';
import type { ScanError } from '@migration-tracker/scanner';
import type { CheckOutcome } from './types.js';

export function siteJson(site: ImportSite): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: site.id,
    groupId: site.groupId,
    filePath: site.filePath,
    line: site.line,
    column: site.column,
    packageName: site.packageName,
    moduleSpecifier: site.moduleSpecifier,
    importKind: site.importKind,
    kinds: [...site.kinds],
    typeOnly: site.typeOnly,
    occurrences: site.occurrences,
    sourceFingerprint: site.sourceFingerprint,
  };
  if (site.suppression) out.suppression = { groupIds: [...site.suppression.groupIds], reason: site.suppression.reason };
  return out;
}

export function formatScanJson(sites: readonly ImportSite[], files: number, errors: readonly ScanError[]): string {
  return `${JSON.stringify(
    {
      schemaVersion: 2,
      sites: sites.map(siteJson),
      files,
      errors: errors.map((e) => ({ filePath: e.filePath, message: e.message })),
    },
    null,
    2,
  )}\n`;
}

function expiredJson(e: ExpiredException): Record<string, unknown> {
  const out: Record<string, unknown> = {
    index: e.index,
    groupId: e.exception.groupId,
    files: [...e.exception.files],
    reason: e.exception.reason,
    owner: e.exception.owner,
    expires: e.exception.expires,
  };
  if (e.exception.issue !== undefined) out.issue = e.exception.issue;
  return out;
}

function compare(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatCheckJson(outcome: CheckOutcome): string {
  const { result } = outcome;
  const violations = [...result.violations]
    .sort(
      (a, b) =>
        compare(a.site.filePath, b.site.filePath) ||
        compare(a.site.line ?? Number.MAX_SAFE_INTEGER, b.site.line ?? Number.MAX_SAFE_INTEGER) ||
        compare(a.site.column ?? Number.MAX_SAFE_INTEGER, b.site.column ?? Number.MAX_SAFE_INTEGER) ||
        compare(a.site.groupId, b.site.groupId),
    )
    .map((v) => ({
      groupId: v.site.groupId,
      filePath: v.site.filePath,
      line: v.site.line,
      column: v.site.column,
      moduleSpecifier: v.site.moduleSpecifier,
      importKind: v.site.importKind,
      kinds: [...v.site.kinds],
      ...(v.site.occurrences !== undefined ? { occurrences: v.site.occurrences } : {}),
      reason: v.reason,
      severity: v.severity,
      message: v.message,
      replacements: [...v.replacements],
      docs: v.docs ?? null,
    }));
  const out: Record<string, unknown> = {
    schemaVersion: 2,
    failed: outcome.failed,
    groups: result.groups.map((g) => ({
      groupId: g.groupId,
      mode: g.mode,
      remaining: g.remaining,
      retired: g.retired,
      newSites: g.newSites,
    })),
    violations,
    retired: [...result.retired].sort(),
    expiredExceptions: [...result.expiredExceptions].sort((a, b) => a.index - b.index).map(expiredJson),
    suppressedCount: result.suppressed.length,
    exceptedCount: result.appliedExceptions.length,
  };
  if (outcome.baselineAdditions !== undefined) out.baselineAdditions = [...outcome.baselineAdditions].sort();
  return `${JSON.stringify(out, null, 2)}\n`;
}
