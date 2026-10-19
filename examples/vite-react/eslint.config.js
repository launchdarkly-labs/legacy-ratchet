import tsParser from '@typescript-eslint/parser';
import legacyRatchet from 'eslint-plugin-legacy-ratchet';

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
    ...legacyRatchet.configs.recommended,
  },
];
