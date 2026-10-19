import { withErrors } from '../errors.js';
import type { Io } from '../io.js';
import { createContext, displayPath, formatIssue, readConfig, type GlobalOptions } from '../load.js';
import { info, plural } from '../output.js';

export type ValidateOptions = GlobalOptions;

export const validateCommand = withErrors(async (options: ValidateOptions, io: Io): Promise<number> => {
  const ctx = createContext(options, io);
  const result = await readConfig(ctx);
  const label = displayPath(ctx, ctx.configPath);
  if (!result.ok) {
    io.stderr(`${ctx.color.red('✖')} ${label} is invalid:\n`);
    for (const issue of result.issues) io.stderr(`${formatIssue(issue)}\n`);
    return 2;
  }
  const groups = Object.keys(result.config.groups).length;
  const exceptions = result.config.exceptions?.length ?? 0;
  info(ctx, `${ctx.color.green('✔')} ${label} is valid (${plural(groups, 'group')}, ${plural(exceptions, 'exception')})`);
  return 0;
});
