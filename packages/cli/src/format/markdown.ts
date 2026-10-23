import { exceptionsSnippet, suppressionComment, type Violation } from '@migration-tracker/core';
import { plural } from '../output.js';
import {
  baselineAdditionGuidance,
  baselineStep,
  DEFAULT_FIX_PATHS,
  exceptionStep,
  EXPIRED_GUIDANCE,
  fixGroupIds,
  replacementText,
  replaceStep,
  suppressStep,
  summaryLine,
  type CheckOutcome,
  type FixPaths,
} from './types.js';

function code(s: string): string {
  return `\`${s.replace(/`/g, "'")}\``;
}

function link(filePath: string, line?: number): string {
  const label = line === undefined ? filePath : `${filePath}:${line}`;
  const target = encodeURI(filePath) + (line === undefined ? '' : `#L${line}`);
  return `[${label.replace(/([[\]])/g, '\\$1')}](${target})`;
}

function fenced(lang: string, body: string): string[] {
  return ['', ...['```' + lang, ...body.split('\n'), '```'].map((l) => `   ${l}`), ''];
}

export function markdownHowToFix(violations: readonly Violation[], paths: FixPaths = DEFAULT_FIX_PATHS): string[] {
  const groups = fixGroupIds(violations);
  return [
    '### How to fix',
    '',
    `1. ${replaceStep(violations)}`,
    `2. ${suppressStep(groups.length)}`,
    ...fenced('ts', groups.map((g) => suppressionComment(g)).join('\n')),
    `3. ${exceptionStep(paths, code)}`,
    ...fenced('json', exceptionsSnippet(violations)),
    `4. ${baselineStep(paths, code)}`,
  ];
}

export function formatCheckMarkdown(outcome: CheckOutcome, paths: FixPaths = DEFAULT_FIX_PATHS): string {
  const { result } = outcome;
  const out: string[] = ['## migration-tracker', ''];
  const n = result.violations.length;
  out.push(outcome.failed ? `**✖ Check failed.** ${summaryLine(outcome)}` : `**✔ Check passed.** ${summaryLine(outcome)}`);
  if (outcome.changed) out.push('', `_Checked ${plural(outcome.changed.files.length, 'changed file')} since ${code(outcome.changed.ref)}._`);
  out.push('', '| Group | Mode | Remaining | Retired | New |', '| --- | --- | ---: | ---: | ---: |');
  for (const g of result.groups) out.push(`| ${g.groupId} | ${g.mode} | ${g.remaining} | ${g.retired} | ${g.newSites} |`);

  if (n > 0) {
    out.push('', `### ${n === 1 ? 'New violation' : 'New violations'}`, '');
    for (const v of result.violations) {
      const parts = [`${v.severity === 'warn' ? '⚠' : '✖'} **${v.site.groupId}**: ${link(v.site.filePath, v.site.line)} — ${v.message}`];
      const repl = replacementText(v.replacements);
      if (repl) parts.push(`${repl}.`);
      if (v.docs) parts.push(`[Migration guide](${v.docs})`);
      out.push(`- ${parts.join(' ')}`);
    }
    out.push('', ...markdownHowToFix(result.violations, paths));
  }
  if (result.expiredExceptions.length > 0) {
    out.push('', '### Expired exceptions', '');
    for (const e of result.expiredExceptions) {
      const x = e.exception;
      out.push(`- ✖ **${x.groupId}** \`exceptions[${e.index}]\` expired on ${x.expires} (${x.files.map(code).join(', ')}, owner ${x.owner}): ${x.reason}`);
    }
    out.push('', EXPIRED_GUIDANCE);
  }
  if (outcome.baselineAdditions && outcome.baselineAdditions.length > 0) {
    out.push('', '### Unauthorized baseline additions', '', 'These allowances were added:', '');
    for (const id of outcome.baselineAdditions) out.push(`- ${code(id)}`);
    out.push('', baselineAdditionGuidance(outcome.baselineAdditions.length, paths, code));
  }
  if (outcome.warnings.length > 0) {
    out.push('', '### Warnings', '');
    for (const w of outcome.warnings) out.push(`- ⚠ ${link(w.filePath, w.line)}: ${w.message.replace(/--/g, '`--`')}`);
  }
  if (result.retired.length > 0) {
    out.push(
      '',
      `🎉 ${plural(result.retired.length, 'legacy site')} retired. Run ${code('migration-tracker baseline update')} and commit ${code(paths.baseline)} to lock in the progress.`,
    );
  }
  return `${out.join('\n')}\n`;
}

