import {
  exceptionsSnippet,
  formatViolation,
  suppressionComment,
  type ExpiredException,
  type ImportSite,
  type LegacyConfig,
  type Violation,
} from '@migration-tracker/core';
import type { ScanError } from '@migration-tracker/scanner';
import type { Colors } from '../io.js';
import { plural } from '../output.js';
import {
  baselineAdditionGuidance,
  baselineStep,
  DEFAULT_FIX_PATHS,
  exceptionStep,
  EXPIRED_GUIDANCE,
  fixGroupIds,
  replaceStep,
  suppressStep,
  summaryLine,
  warningLocation,
  type CheckOutcome,
  type FixPaths,
} from './types.js';

export function colorViolation(v: Violation, c: Colors): string {
  const [head = '', ...rest] = formatViolation(v).split('\n');
  const colored = v.severity === 'warn' ? c.yellow(head) : c.red(head);
  return [colored, ...rest.map((l) => c.dim(l))].join('\n');
}

export function formatExpired(e: ExpiredException, c: Colors): string {
  const x = e.exception;
  const lines = [
    c.red(`✖ ${x.groupId}: exception expired on ${x.expires} (exceptions[${e.index}])`),
    c.dim(`  Files: ${x.files.join(', ')}`),
    c.dim(`  Owner: ${x.owner}`),
    c.dim(`  Reason: ${x.reason}`),
  ];
  if (x.issue) lines.push(c.dim(`  Issue: ${x.issue}`));
  lines.push(c.dim(`  ${EXPIRED_GUIDANCE}`));
  return lines.join('\n');
}

export function formatHowToFix(violations: readonly Violation[], c: Colors, paths: FixPaths = DEFAULT_FIX_PATHS): string {
  const groups = fixGroupIds(violations);
  const indent = (text: string) => text.split('\n').map((l) => `       ${c.cyan(l)}`);
  return [
    c.bold('How to fix'),
    `  1. ${replaceStep(violations)}`,
    `  2. ${suppressStep(groups.length)}`,
    ...groups.flatMap((g) => indent(suppressionComment(g))),
    `  3. ${exceptionStep(paths)}`,
    ...indent(exceptionsSnippet(violations)),
    `  4. ${baselineStep(paths)}`,
  ].join('\n');
}

export function formatCheckText(outcome: CheckOutcome, c: Colors, quiet: boolean, paths: FixPaths = DEFAULT_FIX_PATHS): string {
  const { result } = outcome;
  const blocks: string[] = [];
  for (const v of result.violations) blocks.push(colorViolation(v, c));
  for (const e of result.expiredExceptions) blocks.push(formatExpired(e, c));
  const additions = outcome.baselineAdditions ?? [];
  if (additions.length > 0) {
    blocks.push(
      [
        ...additions.map((id) => c.red(`✖ Unauthorized baseline addition: ${id}`)),
        c.dim(`  ${baselineAdditionGuidance(additions.length, paths)}`),
      ].join('\n'),
    );
  }
  if (!quiet) {
    for (const w of outcome.warnings) blocks.push(c.yellow(`⚠ ${warningLocation(w)}: ${w.message}`));
    if (result.violations.length > 0) blocks.push(formatHowToFix(result.violations, c, paths));
    const tail: string[] = [];
    if (outcome.changed) {
      tail.push(c.dim(`Checked ${plural(outcome.changed.files.length, 'changed file')} since ${outcome.changed.ref}.`));
    }
    tail.push(summaryLine(outcome));
    if (result.retired.length > 0) {
      tail.push(c.dim(`Run "migration-tracker baseline update" to remove ${plural(result.retired.length, 'retired site')} from the baseline.`));
    }
    blocks.push(tail.join('\n'));
  }
  return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`;
}

function siteLine(s: ImportSite): string {
  const flags: string[] = [s.kinds.length > 1 ? `${s.importKind} (${s.kinds.join(', ')})` : s.importKind];
  if (s.typeOnly) flags.push('type-only');
  if (s.suppression) flags.push(s.suppression.reason.trim() === '' ? 'suppression missing reason' : `suppressed: ${s.suppression.reason}`);
  const location = s.line === undefined ? s.filePath : `${s.filePath}:${s.line}${s.column === undefined ? '' : `:${s.column}`}`;
  return `  ${location}  ${s.moduleSpecifier}  (${flags.join(', ')})`;
}

export function formatScanText(config: LegacyConfig, sites: readonly ImportSite[], files: number, errors: readonly ScanError[], c: Colors): string {
  const out: string[] = [];
  for (const [groupId, group] of Object.entries(config.groups)) {
    const groupSites = sites.filter((s) => s.groupId === groupId);
    out.push(`${c.bold(groupId)} ${c.dim(`(${group.enforcement.mode})`)}: ${plural(groupSites.length, 'site')}`);
    for (const s of groupSites) out.push(c.dim(siteLine(s)));
  }
  for (const e of errors) out.push(c.yellow(`⚠ ${e.filePath}: could not scan file: ${e.message}`));
  out.push(`Scanned ${plural(files, 'file')}: ${plural(sites.length, 'legacy site')}.`);
  return `${out.join('\n')}\n`;
}
