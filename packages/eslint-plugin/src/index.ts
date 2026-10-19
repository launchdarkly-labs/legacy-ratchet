import { createRequire } from 'node:module';
import type { TSESLint } from '@typescript-eslint/utils';
import { noLegacyImports } from './rules/no-legacy-imports.js';

const { name, version } = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

export const rules = {
  'no-legacy-imports': noLegacyImports,
};

export interface MigrationTrackerPlugin {
  meta: { name: string; version: string };
  rules: typeof rules;
  configs: { recommended: TSESLint.FlatConfig.Config };
}

const plugin: MigrationTrackerPlugin = {
  meta: { name, version },
  rules,
  configs: { recommended: {} },
};

plugin.configs.recommended = {
  name: 'migration-tracker/recommended',
  plugins: { 'migration-tracker': plugin as unknown as TSESLint.FlatConfig.Plugin },
  rules: { 'migration-tracker/no-legacy-imports': 'error' },
};

export default plugin;
