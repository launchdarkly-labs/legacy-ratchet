import { BASELINE_PATH, CONFIG_FILENAME, type CheckResult, type ImportSite, type Violation } from '@migration-tracker/core';
import type { ScanError } from '@migration-tracker/scanner';

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

export interface FixPaths {
  config: string;
  baseline: string;
}

export const DEFAULT_FIX_PATHS: FixPaths = { config: CONFIG_FILENAME, baseline: BASELINE_PATH };

export function fixGroupIds(violations: readonly Violation[]): string[] {
  return [...new Set(violations.map((v) => v.site.groupId))].sort();
}

export function replaceStep(violations: readonly Violation[]): string {
  const banned = violations.some((v) => v.reason === 'banned');
  const allowed = violations.filter((v) => v.reason !== 'banned');
  if (allowed.length === 0) return 'Remove the import; this package is banned.';
  const base = allowed.some((v) => v.replacements.length > 0)
    ? 'Use the replacement listed above (preferred)'
    : 'Remove the import (preferred)';
  return banned ? `${base}, and remove imports of banned packages.` : `${base}.`;
}

export function suppressStep(groupCount: number): string {
  return groupCount === 1
    ? 'If an import must stay, add this comment on the line above it, with a real reason:'
    : 'If an import must stay, add the comment for its group on the line above it, with a real reason:';
}

export function exceptionStep(paths: FixPaths, code: (s: string) => string = (s) => s): string {
  return `For several files or a temporary period, add an entry to ${code('"exceptions"')} in ${code(paths.config)}:`;
}

export function baselineStep(paths: FixPaths, code: (s: string) => string = (s) => s): string {
  return `Don't add entries to ${code(paths.baseline)} by hand; CI rejects baseline additions.`;
}

export function baselineAdditionGuidance(count: number, paths: FixPaths, code: (s: string) => string = (s) => s): string {
  return `Remove ${count === 1 ? 'this entry' : 'these entries'} from ${code(paths.baseline)} — the baseline may only shrink. To allow a new import, use a suppression comment or an exceptions entry in ${code(paths.config)} instead.`;
}

export const EXPIRED_GUIDANCE = 'Migrate the files or renew the exception with a new expires date.';
