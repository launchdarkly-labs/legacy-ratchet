import type { LegacyConfig } from './types.js';

const URL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isNonPackageSpecifier(spec: string): boolean {
  return (
    spec === '' ||
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    spec.startsWith('\\') ||
    spec.startsWith('#') ||
    URL_SCHEME.test(spec)
  );
}

export function matchPackage(moduleSpecifier: string, packages: readonly string[]): string | undefined {
  if (isNonPackageSpecifier(moduleSpecifier)) return undefined;
  let best: string | undefined;
  for (const p of packages) {
    if (p === '') continue;
    if (moduleSpecifier === p || moduleSpecifier.startsWith(`${p}/`)) {
      if (best === undefined || p.length > best.length) best = p;
    }
  }
  return best;
}

export function packageNameOf(moduleSpecifier: string): string | undefined {
  if (isNonPackageSpecifier(moduleSpecifier)) return undefined;
  const parts = moduleSpecifier.split('/');
  if (moduleSpecifier.startsWith('@')) {
    const [scope, name] = parts;
    if (!scope || scope === '@' || !name) return undefined;
    return `${scope}/${name}`;
  }
  return parts[0] || undefined;
}

export function findGroup(
  config: LegacyConfig,
  moduleSpecifier: string,
): { groupId: string; packageName: string } | undefined {
  let found: { groupId: string; packageName: string } | undefined;
  for (const [groupId, group] of Object.entries(config.groups)) {
    const packageName = matchPackage(moduleSpecifier, group.old);
    if (packageName !== undefined && (found === undefined || packageName.length > found.packageName.length)) {
      found = { groupId, packageName };
    }
  }
  return found;
}
