import type { InlineSuppression } from '@migration-tracker/core';

export type DirectiveKind = 'next-line' | 'line';

export interface Directive {
  kind: DirectiveKind;
  /** 0-based first line the comment occupies. */
  startLine: number;
  /** 0-based last line the comment occupies. */
  endLine: number;
  suppression: InlineSuppression;
}

/** Minimal comment shape shared by ESTree comments (`Line` / `Block`). */
export interface CommentLike {
  type: string;
  value: string;
  loc: { start: { line: number }; end: { line: number } };
}

const DIRECTIVE_RE = /^migration-tracker-disable-(next-line|line)(?=$|\s|--)/;

/**
 * Comment body without delimiters. Mirrors `commentBody` in
 * `@migration-tracker/scanner/src/suppression.ts`, which works on the raw comment
 * text (`//…` or `/*…*\/`); ESTree gives us the text between the delimiters, so
 * the raw form is rebuilt first to keep the two implementations identical.
 */
function commentBody(value: string, block: boolean): string {
  if (!block) {
    return `//${value}`.replace(/^\/\/+/, '').trim();
  }
  const inner = `/*${value}*/`.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
  return inner
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\*?/, '').trim())
    .filter((l) => l.length > 0)
    .join(' ')
    .trim();
}

/** Parses one comment; undefined when it is not a migration-tracker directive. */
export function parseDirective(
  value: string,
  block: boolean,
): { kind: DirectiveKind; suppression: InlineSuppression } | undefined {
  const body = commentBody(value, block);
  const m = DIRECTIVE_RE.exec(body);
  if (!m) return undefined;
  const rest = body.slice(m[0].length);
  const sep = rest.indexOf('--');
  const idsPart = sep === -1 ? rest : rest.slice(0, sep);
  const reason = sep === -1 ? '' : rest.slice(sep + 2).trim();
  const groupIds = idsPart
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { kind: m[1] === 'next-line' ? 'next-line' : 'line', suppression: { groupIds, reason } };
}

/** Collects every directive among `comments` (ESTree `Line`/`Block`; shebangs are skipped). */
export function collectDirectives(comments: readonly CommentLike[]): Directive[] {
  const directives: Directive[] = [];
  for (const c of comments) {
    if (c.type !== 'Line' && c.type !== 'Block') continue;
    const parsed = parseDirective(c.value, c.type === 'Block');
    if (!parsed) continue;
    directives.push({
      kind: parsed.kind,
      startLine: c.loc.start.line - 1,
      endLine: c.loc.end.line - 1,
      suppression: parsed.suppression,
    });
  }
  directives.sort((a, b) => a.startLine - b.startLine);
  return directives;
}

/**
 * Finds the suppression for an import (0-based lines). Next-line directives
 * win over same-line ones; within a kind the first comment wins.
 */
export function findSuppression(
  directives: readonly Directive[],
  startLine: number,
  specifierLine: number,
): InlineSuppression | undefined {
  for (const d of directives) {
    if (d.kind === 'next-line' && d.endLine === startLine - 1) return d.suppression;
  }
  for (const d of directives) {
    if (d.kind !== 'line') continue;
    const touches = (l: number): boolean => d.startLine <= l && l <= d.endLine;
    if (touches(startLine) || touches(specifierLine)) return d.suppression;
  }
  return undefined;
}
