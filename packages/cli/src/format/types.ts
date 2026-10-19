import type { CheckResult, ImportSite } from '@legacy-ratchet/core';
import type { ScanError } from '@legacy-ratchet/scanner';

export interface CheckWarning {
  kind: 'missing-suppression-reason' | 'scan-error' | 'unlocated';
  filePath: string;
  line?: number;
  column?: number;
  message: string;
}

export interface CheckOutcome {
  result: CheckResult;
  sites: ImportSite[];
  warnings: CheckWarning[];
  baselineAdditions?: string[];
  changed?: { ref: string; files: string[] };
  fileCount: number;
  failed: boolean;
}

export const MISSING_REASON_MESSAGE = 'suppression requires a reason after --';

export function unlocatedWarning(id: string): string {
  return `position unavailable for ${id}; depcruise reported it but the scanner did not find it — e.g. typeof import() of an unresolved package`;
}

export function warningsFor(
  sites: readonly ImportSite[],
  errors: readonly ScanError[],
  unlocated: readonly ImportSite[] = [],
): CheckWarning[] {
  const warnings: CheckWarning[] = [];
  for (const site of sites) {
    if (site.suppression && site.suppression.reason.trim() === '') {
      warnings.push({
        kind: 'missing-suppression-reason',
        filePath: site.filePath,
        line: site.line,
        column: site.column,
        message: MISSING_REASON_MESSAGE,
      });
    }
  }
  for (const e of errors) warnings.push({ kind: 'scan-error', filePath: e.filePath, message: `could not scan file: ${e.message}` });
  for (const s of unlocated) warnings.push({ kind: 'unlocated', filePath: s.filePath, message: unlocatedWarning(s.id) });
  return warnings;
}

export function totalRemaining(outcome: CheckOutcome): number {
  return outcome.result.groups.reduce((n, g) => n + g.remaining, 0);
}

export function summaryLine(outcome: CheckOutcome): string {
  const n = outcome.result.violations.length;
  return `Legacy sites: ${totalRemaining(outcome)} remaining | ${outcome.result.retired.length} retired | ${n} new ${n === 1 ? 'violation' : 'violations'}`;
}

export function replacementText(replacements: readonly string[]): string | undefined {
  if (replacements.length === 0) return undefined;
  const label = replacements.length === 1 ? 'Preferred replacement' : 'Preferred replacements';
  return `${label}: ${replacements.map((r) => `"${r}"`).join(', ')}`;
}

export function warningLocation(w: CheckWarning): string {
  return w.line === undefined ? w.filePath : `${w.filePath}:${w.line}`;
}
