import { plural } from '../output.js';
import { replacementText, summaryLine, type CheckOutcome } from './types.js';

function code(s: string): string {
  return `\`${s.replace(/`/g, "'")}\``;
}

function link(filePath: string, line?: number): string {
  const label = line === undefined ? filePath : `${filePath}:${line}`;
  const target = encodeURI(filePath) + (line === undefined ? '' : `#L${line}`);
  return `[${label.replace(/([[\]])/g, '\\$1')}](${target})`;
}

export function formatCheckMarkdown(outcome: CheckOutcome): string {
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
  }
  if (result.expiredExceptions.length > 0) {
    out.push('', '### Expired exceptions', '');
    for (const e of result.expiredExceptions) {
      const x = e.exception;
      out.push(`- ✖ **${x.groupId}** \`exceptions[${e.index}]\` expired on ${x.expires} (${x.files.map(code).join(', ')}, owner ${x.owner}): ${x.reason}`);
    }
  }
  if (outcome.baselineAdditions && outcome.baselineAdditions.length > 0) {
    out.push('', '### Unauthorized baseline additions', '', 'The baseline may only shrink. These allowances were added:', '');
    for (const id of outcome.baselineAdditions) out.push(`- ${code(id)}`);
  }
  if (outcome.warnings.length > 0) {
    out.push('', '### Warnings', '');
    for (const w of outcome.warnings) out.push(`- ⚠ ${link(w.filePath, w.line)}: ${w.message.replace(/--/g, '`--`')}`);
  }
  if (result.retired.length > 0) {
    out.push(
      '',
      `🎉 ${plural(result.retired.length, 'legacy site')} retired. Run ${code('migration-tracker baseline update')} and commit ${code('.migrations/baseline.json')} to lock in the progress.`,
    );
  }
  return `${out.join('\n')}\n`;
}

