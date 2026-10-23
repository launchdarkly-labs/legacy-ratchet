import { createHash } from 'node:crypto';
import { findGroup } from './match.js';
import type { ImportKind, ImportSite, LegacyConfig, RawImport, SiteKind } from './types.js';

export type SiteKey = Pick<ImportSite, 'groupId' | 'filePath' | 'importKind' | 'moduleSpecifier'>;

const SITE_KINDS: readonly SiteKind[] = ['import', 'require'];
const IMPORT_KINDS: readonly ImportKind[] = ['import', 'require', 'dynamic-import', 'export-from', 'import-equals'];

export function siteKindOf(kind: ImportKind): SiteKind {
  return kind === 'require' || kind === 'import-equals' ? 'require' : 'import';
}

export function fingerprint(importKind: SiteKind, moduleSpecifier: string): string {
  return createHash('sha256').update(`${importKind}\u0000${moduleSpecifier}`).digest('hex').slice(0, 16);
}

export function siteId(s: SiteKey): string {
  return `${s.groupId}|${s.filePath}|${s.importKind}|${s.moduleSpecifier}`;
}

export function groupFileKey(s: Pick<SiteKey, 'groupId' | 'filePath'>): string {
  return `${s.groupId}|${s.filePath}`;
}

export function groupFileKeyOfId(id: string): string | undefined {
  try {
    return groupFileKey(parseSiteId(id));
  } catch {
    return undefined;
  }
}

export function parseSiteId(id: string): SiteKey {
  const parts = id.split('|');
  if (parts.length === 5) {
    throw new Error(
      `Invalid site id "${id}": this is a schemaVersion 1 id (with an occurrence); run \`migration-tracker baseline migrate\` to upgrade the baseline`,
    );
  }
  if (parts.length !== 4) {
    throw new Error(`Invalid site id "${id}": expected 4 "|"-separated parts, got ${parts.length}`);
  }
  const [groupId, filePath, importKind, moduleSpecifier] = parts as [string, string, string, string];
  if (!groupId || !filePath || !moduleSpecifier) {
    throw new Error(`Invalid site id "${id}": groupId, filePath and moduleSpecifier must be non-empty`);
  }
  if (!(SITE_KINDS as readonly string[]).includes(importKind)) {
    throw new Error(`Invalid site id "${id}": unknown import kind "${importKind}" (expected "import" or "require")`);
  }
  return { groupId, filePath, importKind: importKind as SiteKind, moduleSpecifier };
}

export function migrateSiteIdV1(id: string): string | undefined {
  const parts = id.split('|');
  if (parts.length !== 5) return undefined;
  const [groupId, filePath, importKind, moduleSpecifier, occurrence] = parts as [string, string, string, string, string];
  if (!groupId || !filePath || !moduleSpecifier) return undefined;
  if (!(IMPORT_KINDS as readonly string[]).includes(importKind)) return undefined;
  if (!/^(0|[1-9]\d*)$/.test(occurrence)) return undefined;
  return siteId({ groupId, filePath, importKind: siteKindOf(importKind as ImportKind), moduleSpecifier });
}

export function siteIdForImport(config: LegacyConfig, raw: RawImport): string | undefined {
  const found = findGroup(config, raw.moduleSpecifier);
  if (!found) return undefined;
  return siteId({
    groupId: found.groupId,
    filePath: normalizePath(raw.filePath),
    importKind: siteKindOf(raw.importKind),
    moduleSpecifier: raw.moduleSpecifier,
  });
}

function normalizeSegments(path: string): string {
  const absolute = path.startsWith('/');
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..' && out.length > 0 && out[out.length - 1] !== '..') {
      out.pop();
      continue;
    }
    if (seg === '..' && absolute) continue;
    out.push(seg);
  }
  return (absolute ? '/' : '') + out.join('/');
}

export function normalizePath(filePath: string, root?: string): string {
  let p = normalizeSegments(filePath.replace(/\\/g, '/'));
  if (root !== undefined && root !== '') {
    const r = normalizeSegments(root.replace(/\\/g, '/'));
    if (r === '/' && p.startsWith('/')) {
      p = p.slice(1);
    } else if (p === r) {
      p = '';
    } else if (r !== '' && p.startsWith(`${r}/`)) {
      p = p.slice(r.length + 1);
    }
  }
  return p;
}
