import type { Violation } from './types.js';

export function formatViolation(v: Violation): string {
  const icon = v.severity === 'warn' ? '⚠' : '✖';
  const lines = [`${icon} ${v.site.groupId}: ${v.site.line === undefined ? v.site.filePath : `${v.site.filePath}:${v.site.line}`}`, `  ${v.message}`];
  if (v.replacements.length === 1) {
    lines.push(`  Preferred replacement: "${v.replacements[0]}"`);
  } else if (v.replacements.length > 1) {
    lines.push(`  Preferred replacements: ${v.replacements.map((r) => `"${r}"`).join(', ')}`);
  }
  if (v.docs) lines.push(`  Migration guide: ${v.docs}`);
  return lines.join('\n');
}
