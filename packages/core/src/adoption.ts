import { normalizePath } from './identity.js';
import { matchPackage } from './match.js';
import type { AdoptionCount, LegacyConfig, RawImport } from './types.js';
import { compareStrings } from './util.js';

export function newPackages(config: LegacyConfig): string[] {
  const names = new Set<string>();
  for (const group of Object.values(config.groups)) {
    for (const p of group.new) if (p !== '') names.add(p);
  }
  return [...names].sort(compareStrings);
}

export function collectAdoption(config: LegacyConfig, raw: readonly RawImport[]): AdoptionCount[] {
  const seen = new Map<string, AdoptionCount>();
  const groups = Object.entries(config.groups);
  for (const r of raw) {
    for (const [groupId, group] of groups) {
      const packageName = matchPackage(r.moduleSpecifier, group.new);
      if (packageName === undefined || group.old.includes(packageName)) {
        continue;
      }
      const filePath = normalizePath(r.filePath);
      const key = `${groupId}|${filePath}|${packageName}`;
      if (!seen.has(key)) {
        seen.set(key, { groupId, filePath, packageName });
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) =>
      compareStrings(a.groupId, b.groupId) ||
      compareStrings(a.filePath, b.filePath) ||
      compareStrings(a.packageName, b.packageName),
  );
}
