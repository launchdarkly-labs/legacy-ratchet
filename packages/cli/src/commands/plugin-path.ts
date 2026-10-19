import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withErrors } from '../errors.js';
import type { Io } from '../io.js';
import type { GlobalOptions } from '../load.js';

export function depcruisePluginPath(): string {
  return fileURLToPath(new URL('../depcruise-plugin.js', import.meta.url));
}

export const depcruisePluginPathCommand = withErrors(async (_options: GlobalOptions, io: Io): Promise<number> => {
  const file = depcruisePluginPath();
  io.stdout(`${file}\n`);
  if (!existsSync(file)) io.stderr(`warning: ${file} does not exist yet; build @legacy-ratchet/cli first\n`);
  return 0;
});
