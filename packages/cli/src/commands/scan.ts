import { reportEngineWarnings, resolveEngineOptions, type EngineFlags } from '../engine-options.js';
import { CliError, withErrors } from '../errors.js';
import { formatScanJson } from '../format/json.js';
import { formatScanText } from '../format/text.js';
import { createColors, type Io } from '../io.js';
import { createContext, loadConfig, type GlobalOptions } from '../load.js';
import { emit } from '../output.js';
import { scanProject } from '../project.js';

export interface ScanOptions extends GlobalOptions, EngineFlags {
  format?: string;
  output?: string;
  ignore?: string[];
  changedSince?: string;
}

export const scanCommand = withErrors(async (options: ScanOptions, io: Io): Promise<number> => {
  const format = options.format ?? 'text';
  if (format !== 'text' && format !== 'json') throw new CliError(`Unknown format "${format}" (expected text or json)`);
  const ctx = createContext(options, io);
  const config = await loadConfig(ctx);
  const scan = await scanProject(ctx, config, {
    ...resolveEngineOptions(ctx, options),
    ignore: options.ignore ?? [],
    ...(options.changedSince !== undefined ? { changedSince: options.changedSince } : {}),
  });
  reportEngineWarnings(ctx, scan);
  const content =
    format === 'json'
      ? formatScanJson(scan.sites, scan.fileCount, scan.errors)
      : formatScanText(config, scan.sites, scan.fileCount, scan.errors, options.output === undefined ? ctx.color : createColors(false));
  await emit(ctx, content, options.output);
  return 0;
});

