import type { InlineSuppression } from '@legacy-ratchet/core';
import ts from 'typescript';

export type DirectiveKind = 'next-line' | 'line';

export interface Directive {
  kind: DirectiveKind;
  /** 0-based first line the comment occupies. */
  startLine: number;
  /** 0-based last line the comment occupies. */
  endLine: number;
  suppression: InlineSuppression;
}

const DIRECTIVE_RE = /^legacy-ratchet-disable-(next-line|line)(?=$|\s|--)/;

/** Extracts the comment body (without delimiters) from raw comment text. */
function commentBody(raw: string, kind: ts.CommentKind): string {
  if (kind === ts.SyntaxKind.SingleLineCommentTrivia) {
    return raw.replace(/^\/\/+/, '').trim();
  }
  const inner = raw.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
  return inner
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\*?/, '').trim())
    .filter((l) => l.length > 0)
    .join(' ')
    .trim();
}

/**
 * Parses a single comment's text. Returns undefined if it is not a
 * legacy-ratchet directive.
 */
export function parseDirective(
  raw: string,
  kind: ts.CommentKind,
): { kind: DirectiveKind; suppression: InlineSuppression } | undefined {
  const body = commentBody(raw, kind);
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

/**
 * Collects every legacy-ratchet directive comment in the file by gathering
 * the comment ranges in the trivia at every node boundary (TS splits trivia
 * into "trailing" up to the first newline and "leading" after it, so both are
 * read at each position). This only
 * sees real comments (never text inside strings, templates, regexes or JSX text).
 */
export function collectDirectives(sf: ts.SourceFile): Directive[] {
  const text = sf.text;
  const seen = new Set<number>();
  const candidates: ts.CommentRange[] = [];
  const jsxText: [number, number][] = [];

  const addRanges = (ranges: ts.CommentRange[] | undefined): void => {
    if (!ranges) return;
    for (const r of ranges) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      candidates.push(r);
    }
  };

  const addTriviaAt = (pos: number): void => {
    addRanges(ts.getTrailingCommentRanges(text, pos));
    addRanges(ts.getLeadingCommentRanges(text, pos));
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) jsxText.push([node.pos, node.end]);
    addTriviaAt(node.pos);
    addTriviaAt(node.end);
    if (ts.isJsxExpression(node) && !node.expression) {
      addTriviaAt(node.getStart(sf) + 1);
    }
    ts.forEachChild(node, visit);
  };
  addTriviaAt(0);
  ts.forEachChild(sf, visit);

  // Trivia scanning at JsxText boundaries reads JSX text as if it were code; drop those.
  const inJsxText = (pos: number): boolean => jsxText.some(([start, stop]) => pos >= start && pos < stop);

  const directives: Directive[] = [];
  for (const r of candidates) {
    if (inJsxText(r.pos)) continue;
    const parsed = parseDirective(text.slice(r.pos, r.end), r.kind);
    if (!parsed) continue;
    directives.push({
      kind: parsed.kind,
      startLine: sf.getLineAndCharacterOfPosition(r.pos).line,
      endLine: sf.getLineAndCharacterOfPosition(r.end).line,
      suppression: parsed.suppression,
    });
  }

  directives.sort((a, b) => a.startLine - b.startLine);
  return directives;
}

/**
 * Finds the suppression that applies to an import.
 *
 * - `disable-next-line`: the comment's last line is the line immediately before `startLine`.
 * - `disable-line`: the comment touches `startLine` or `specifierLine`.
 *
 * Next-line directives win over same-line directives; within a kind the
 * first comment in source order wins.
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
