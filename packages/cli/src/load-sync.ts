import { statSync } from 'node:fs';
import path from 'node:path';

export const LEGACY_CONFIG_FILENAME = 'migrations.json';

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Nearest directory at or above `startDir` containing `migrations.json`. */
export function findRoot(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    if (isFile(path.join(dir, LEGACY_CONFIG_FILENAME))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface ConfigLocation {
  root: string;
  configPath: string;
}

/**
 * `envConfig` (absolute or relative to `cwd`) wins and makes its directory the root;
 * otherwise walk up from `startDir` to the nearest `migrations.json`.
 */
export function locateConfig(envConfig: string | undefined, cwd: string, startDir: string): ConfigLocation | undefined {
  if (envConfig !== undefined && envConfig !== '') {
    const configPath = path.resolve(cwd, envConfig);
    return { root: path.dirname(configPath), configPath };
  }
  const root = findRoot(path.resolve(cwd, startDir));
  return root === undefined ? undefined : { root, configPath: path.join(root, LEGACY_CONFIG_FILENAME) };
}
