import picomatch from 'picomatch';

import type { LegacyConfig } from './types.js';

export function isIgnoredPath(config: Pick<LegacyConfig, 'ignore'>, filePath: string, extra: readonly string[] = []): boolean {
  const patterns = [...(config.ignore ?? []), ...extra];
  if (patterns.length === 0) return false;
  return picomatch(patterns, { dot: true })(filePath);
}
