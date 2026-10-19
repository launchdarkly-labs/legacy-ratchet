import { replacementText, summaryLine, type CheckOutcome } from './types.js';

export function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function annotation(
  level: 'error' | 'warning',
  props: { file?: string; line?: number; col?: number; title: string },
  message: string,
): string {
  const parts: string[] = [];
  if (props.file !== undefined) parts.push(`file=${escapeProperty(props.file)}`);
  if (props.line !== undefined) parts.push(`line=${props.line}`);
  if (props.col !== undefined) parts.push(`col=${props.col}`);
  parts.push(`title=${escapeProperty(props.title)}`);
  return `::${level} ${parts.join(',')}::${escapeData(message)}`;
}

export interface GithubPaths {
  prefix: string;
  configPath?: string;
  baselinePath: string;
}

export function formatCheckGithub(outcome: CheckOutcome, paths: GithubPaths): string {
  const { result } = outcome;
  const file = (p: string) => `${paths.prefix}${p}`;
  const out: string[] = [];
  for (const v of result.violations) {
    const message = [v.message, replacementText(v.replacements), v.docs ? `Migration guide: ${v.docs}` : undefined]
      .filter((s): s is string => s !== undefined)
      .join(' ');
    out.push(
      annotation(
        v.severity === 'warn' ? 'warning' : 'error',
        {
          file: file(v.site.filePath),
          ...(v.site.line !== undefined ? { line: v.site.line } : {}),
          ...(v.site.line !== undefined && v.site.column !== undefined ? { col: v.site.column } : {}),
          title: `migration-tracker/${v.site.groupId}`,
        },
        message,
      ),
    );
  }
  for (const e of result.expiredExceptions) {
    const x = e.exception;
    out.push(
      annotation(
        'error',
        { ...(paths.configPath !== undefined ? { file: paths.configPath } : {}), title: `migration-tracker/${x.groupId}` },
        `Exception exceptions[${e.index}] for "${x.groupId}" expired on ${x.expires} (owner ${x.owner}): ${x.reason}`,
      ),
    );
  }
  for (const id of outcome.baselineAdditions ?? []) {
    out.push(
      annotation(
        'error',
        { file: paths.baselinePath, title: 'migration-tracker/baseline' },
        `Unauthorized baseline addition: ${id}. The baseline may only shrink.`,
      ),
    );
  }
  for (const w of outcome.warnings) {
    out.push(
      annotation(
        'warning',
        {
          file: file(w.filePath),
          ...(w.line !== undefined ? { line: w.line } : {}),
          ...(w.column !== undefined ? { col: w.column } : {}),
          title: 'migration-tracker',
        },
        w.message,
      ),
    );
  }
  out.push(summaryLine(outcome));
  return `${out.join('\n')}\n`;
}
