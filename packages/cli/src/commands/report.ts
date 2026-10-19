import path from 'node:path';
import { assignOwners, buildReport, historyEntry } from '@migration-tracker/core';
import { renderDashboard } from '../dashboard.js';
import { reportEngineWarnings, resolveEngineOptions, type EngineFlags } from '../engine-options.js';
import { CliError, withErrors } from '../errors.js';
import { revision } from '../git.js';
import type { Io } from '../io.js';
import {
  appendLine,
  createContext,
  displayPath,
  historyFile,
  loadCodeowners,
  loadConfig,
  loadHistory,
  type GlobalOptions,
} from '../load.js';
import { emit, status, warn } from '../output.js';
import { scanProject } from '../project.js';

export const DEFAULT_HTML_OUTPUT = 'migration-report.html';

export interface ReportOptions extends GlobalOptions, EngineFlags {
  format?: string;
  output?: string;
  appendHistory?: boolean;
  template?: string;
  history?: string;
  sourceUrl?: string;
  codeowners?: string | false;
}

export const reportCommand = withErrors(async (options: ReportOptions, io: Io): Promise<number> => {
  const format = options.format ?? 'html';
  if (format !== 'html' && format !== 'json') throw new CliError(`Unknown format "${format}" (expected html or json)`);
  const ctx = createContext(options, io);
  const config = await loadConfig(ctx);
  const historyPath = options.history !== undefined ? path.resolve(io.cwd, options.history) : historyFile(ctx);
  const history = await loadHistory(ctx, (m) => warn(ctx, m), historyPath);
  const codeowners = await loadCodeowners(ctx, options.codeowners);
  const scan = await scanProject(ctx, config, { ...resolveEngineOptions(ctx, options), adoption: true });
  reportEngineWarnings(ctx, scan);
  for (const e of scan.errors) warn(ctx, `${e.filePath}: could not scan file: ${e.message}`);
  const rev = await revision(ctx.root);
  const sites = codeowners ? assignOwners(scan.sites, codeowners.rules) : scan.sites;
  const report = buildReport(config, sites, {
    history,
    adoption: scan.adoption ?? [],
    ...(rev ? { revision: rev } : {}),
    ...(options.sourceUrl ? { sourceUrlTemplate: options.sourceUrl } : {}),
  });

  const entry = historyEntry(report);
  if (options.appendHistory) report.history = [...history, entry];

  if (format === 'json') {
    await emit(ctx, `${JSON.stringify(report, null, 2)}\n`, options.output);
  } else {
    const html = await renderDashboard(report, options.template);
    await emit(ctx, html, options.output ?? path.join(ctx.root, DEFAULT_HTML_OUTPUT));
  }

  if (options.appendHistory) {
    await appendLine(historyPath, JSON.stringify(entry));
    status(ctx, `Appended history entry to ${displayPath(ctx, historyPath)}`);
  }
  return 0;
});
