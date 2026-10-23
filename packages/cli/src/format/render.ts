import type { Colors } from '../io.js';
import { formatCheckGithub, type GithubPaths } from './github.js';
import { formatCheckJson } from './json.js';
import { formatCheckMarkdown } from './markdown.js';
import { formatCheckText } from './text.js';
import type { CheckOutcome, FixPaths } from './types.js';

export type CheckFormat = 'text' | 'json' | 'markdown' | 'github';
export const CHECK_FORMATS: readonly CheckFormat[] = ['text', 'json', 'markdown', 'github'];

export interface RenderCheckOptions {
  colors: Colors;
  quiet: boolean;
  github: GithubPaths;
  paths: FixPaths;
}

export function renderCheck(outcome: CheckOutcome, format: CheckFormat, opts: RenderCheckOptions): string {
  switch (format) {
    case 'json':
      return formatCheckJson(outcome);
    case 'markdown':
      return formatCheckMarkdown(outcome, opts.paths);
    case 'github':
      return formatCheckGithub(outcome, opts.github);
    default:
      return formatCheckText(outcome, opts.colors, opts.quiet, opts.paths);
  }
}

export function githubPaths(prefix: string, relConfig: string, baselinePath: string): GithubPaths {
  return {
    prefix,
    baselinePath: `${prefix}${baselinePath}`,
    ...(relConfig.startsWith('..') || relConfig.startsWith('/') || /^[a-zA-Z]:/.test(relConfig)
      ? {}
      : { configPath: `${prefix}${relConfig}` }),
  };
}

export function fixPaths(relConfig: string, configPath: string, baselinePath: string): FixPaths {
  const outside = relConfig.startsWith('..') || relConfig.startsWith('/') || /^[a-zA-Z]:/.test(relConfig);
  return { config: outside ? configPath : relConfig, baseline: baselinePath };
}
