import type { ImportKind, LegacyConfig, RawImport } from '../types.js';
import { validateConfig } from '../config.js';

export function config(input: unknown): LegacyConfig {
  const result = validateConfig(input);
  if (!result.ok) throw new Error(`invalid test config: ${JSON.stringify(result.issues)}`);
  return result.config;
}

export function raw(
  filePath: string,
  moduleSpecifier: string,
  line: number,
  extra: Partial<RawImport> & { importKind?: ImportKind } = {},
): RawImport {
  return { filePath, moduleSpecifier, importKind: 'import', typeOnly: false, line, column: 1, ...extra };
}
