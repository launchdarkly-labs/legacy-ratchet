import type { ImportSite } from './types.js';

export interface CodeownersRule {
  pattern: string;
  owners: string[];
  line: number;
}

export const CODEOWNERS_LOCATIONS: readonly string[] = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];

function stripComment(line: string): string {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '\\' && line[i + 1] === '#') {
      out += '\\#';
      i++;
      continue;
    }
    if (ch === '#') {
      break;
    }
    out += ch;
  }
  return out;
}

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '\\' && line[i + 1] === ' ') {
      current += '\\ ';
      i++;
    } else if (/\s/.test(ch)) {
      if (current !== '') {
        tokens.push(current);
      }
      current = '';
    } else {
      current += ch;
    }
  }
  if (current !== '') {
    tokens.push(current);
  }
  return tokens;
}

export function parseCodeowners(text: string): CodeownersRule[] {
  const rules: CodeownersRule[] = [];
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const tokens = tokenize(stripComment(rawLine));
    const [pattern, ...owners] = tokens;
    if (pattern === undefined) {
      return;
    }
    rules.push({ pattern, owners, line: i + 1 });
  });
  return rules;
}

function escapeRegex(ch: string): string {
  return /[.*+?^${}()|[\]\\/]/.test(ch) ? `\\${ch}` : ch;
}

function globBody(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === '\\' && i + 1 < glob.length) {
      out += escapeRegex(glob[i + 1]!);
      i++;
    } else if (ch === '*') {
      if (glob[i + 1] === '*') {
        const atSegmentStart = i === 0 || glob[i - 1] === '/';
        const atSegmentEnd = i + 2 === glob.length || glob[i + 2] === '/';
        while (glob[i + 1] === '*') {
          i++;
        }
        if (atSegmentStart && atSegmentEnd) {
          if (glob[i + 1] === '/') {
            out += '(?:.*/)?';
            i++;
          } else {
            out += '.*';
          }
          continue;
        }
      }
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(ch);
    }
  }
  return out;
}

export function codeownersPatternRegex(pattern: string): RegExp {
  let p = pattern;
  const directoryOnly = p.endsWith('/') && p.length > 1;
  if (directoryOnly) {
    p = p.replace(/\/+$/, '');
  }
  const anchored = p.startsWith('/') || p.includes('/');
  if (p.startsWith('/')) {
    p = p.replace(/^\/+/, '');
  }
  if (p === '') {
    return /^.+$/;
  }

  const prefix = anchored ? '^' : '^(?:.*/)?';
  const body = globBody(p);
  let suffix = '(?:/.*)?$';
  if (directoryOnly) suffix = '/.+$';
  else if (p === '*' || p.endsWith('/*') || p.endsWith('/**')) suffix = '$';
  return new RegExp(`${prefix}${body}${suffix}`);
}

const compiled = new WeakMap<CodeownersRule, RegExp>();

function regexFor(rule: CodeownersRule): RegExp {
  let re = compiled.get(rule);
  if (!re) {
    re = codeownersPatternRegex(rule.pattern);
    compiled.set(rule, re);
  }
  return re;
}

export function ownersFor(rules: readonly CodeownersRule[], filePath: string): string[] | undefined {
  const path = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i]!;
    if (regexFor(rule).test(path)) {
      return rule.owners.length > 0 ? [...rule.owners] : undefined;
    }
  }
  return undefined;
}

export function assignOwners(sites: readonly ImportSite[], rules: readonly CodeownersRule[]): ImportSite[] {
  const cache = new Map<string, string[] | undefined>();
  return sites.map((site) => {
    if (!cache.has(site.filePath)) {
      cache.set(site.filePath, ownersFor(rules, site.filePath));
    }
    const owners = cache.get(site.filePath);
    const { owners: _previous, ...rest } = site;
    return owners ? { ...rest, owners: [...owners] } : rest;
  });
}
