import path from 'node:path';
import {
  collectSites,
  evaluate,
  isIgnoredPath,
  siteIdForImport,
  suppressesGroup,
  type LegacyConfig,
  type Violation,
} from '@legacy-ratchet/core';
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { collectImports, type CollectedImport } from '../collect.js';
import { loadProject, type RuleOptions } from '../load.js';

const createRule = ESLintUtils.RuleCreator.withoutDocs;

export type MessageIds = 'newImport' | 'banned' | 'invalidConfig' | 'invalidBaseline';

function quoteList(items: readonly string[]): string {
  const quoted = items.map((i) => `"${i}"`);
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
}

/** ` Use "a" instead.` / ` Use "a" or "b" instead.` / `` when there are no replacements. */
export function replacementText(replacements: readonly string[]): string {
  return replacements.length === 0 ? '' : ` Use ${quoteList(replacements)} instead.`;
}

function toPosixRelative(root: string, file: string): string | undefined {
  const rel = path.relative(root, file);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  return rel.split(path.sep).join('/');
}

export const noLegacyImports = createRule<[RuleOptions], MessageIds>({
  name: 'no-legacy-imports',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow new import sites of legacy packages listed in legacy.json that are not in the baseline',
    },
    schema: [
      {
        type: 'object',
        properties: {
          configPath: { type: 'string' },
          baselinePath: { type: 'string' },
          root: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      newImport: 'New import of "{{specifier}}" is not allowed ({{group}}).{{replacementText}}{{docsText}}',
      banned: 'Import of "{{specifier}}" is banned ({{group}}).{{replacementText}}{{docsText}}',
      invalidConfig: 'legacy-ratchet: invalid {{configPath}}: {{issues}}',
      invalidBaseline: 'legacy-ratchet: invalid baseline {{baselinePath}}: {{message}}',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const filename = context.physicalFilename || context.filename;
    if (!path.isAbsolute(filename)) return {};
    const project = loadProject(filename, context.cwd, options);
    if (!project) return {};
    const filePath = toPosixRelative(project.root, filename);
    if (filePath === undefined) return {};

    if (project.kind === 'invalid-config') {
      const issues = project.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
      const configPath = toPosixRelative(project.root, project.configPath) ?? project.configPath;
      return {
        Program(node: TSESTree.Program): void {
          context.report({ node, messageId: 'invalidConfig', data: { configPath, issues } });
        },
      };
    }
    if (project.kind === 'invalid-baseline') {
      const baselinePath = toPosixRelative(project.root, project.baselinePath) ?? project.baselinePath;
      return {
        Program(node: TSESTree.Program): void {
          context.report({ node, messageId: 'invalidBaseline', data: { baselinePath, message: project.message } });
        },
      };
    }

    const { config, baseline } = project;
    if (isIgnoredPath(config, filePath)) return {};

    return {
      'Program:exit'(): void {
        const collected = collectImports(context.sourceCode, filePath);
        if (collected.length === 0) return;
        const sites = collectSites(
          config,
          collected.map((c) => c.raw),
        );
        if (sites.length === 0) return;
        const result = evaluate(config, sites, baseline);
        if (result.violations.length === 0) return;
        const occurrences = occurrencesBySite(config, collected);
        for (const v of result.violations) {
          // Without a baseline (before adoption) only ban-mode groups report.
          if (baseline === undefined && v.reason === 'new-site') continue;
          const messageId = v.reason === 'banned' ? 'banned' : 'newImport';
          const data = reportData(v);
          // A site is file-level: report each of its occurrences, except ones whose own comment suppresses the group.
          for (const c of occurrences.get(v.site.id) ?? []) {
            if (suppressesGroup(c.raw.suppression, v.site.groupId)) continue;
            context.report({ node: c.node, messageId, data });
          }
        }
      },
    };
  },
});

/** Groups collected imports by the site id `collectSites` gives them, keeping source order. */
function occurrencesBySite(config: LegacyConfig, collected: readonly CollectedImport[]): Map<string, CollectedImport[]> {
  const out = new Map<string, CollectedImport[]>();
  for (const c of collected) {
    const id = siteIdForImport(config, c.raw);
    if (id === undefined) continue;
    const list = out.get(id);
    if (list) list.push(c);
    else out.set(id, [c]);
  }
  return out;
}

function reportData(v: Violation): Record<string, string> {
  return {
    specifier: v.site.moduleSpecifier,
    group: v.site.groupId,
    replacements: v.replacements.join(', '),
    docs: v.docs ?? '',
    replacementText: replacementText(v.replacements),
    docsText: v.docs ? ` See ${v.docs}` : '',
  };
}
