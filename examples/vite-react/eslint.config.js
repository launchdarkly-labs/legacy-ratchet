import tsParser from '@typescript-eslint/parser';
import migrationTracker from 'eslint-plugin-migration-tracker';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ...migrationTracker.configs.recommended,
  },
];
