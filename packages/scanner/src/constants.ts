export const SCANNER_VERSION: string = '0.2.0';

export const DEFAULT_EXTENSIONS: readonly string[] = Object.freeze([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

export const DEFAULT_IGNORE: readonly string[] = Object.freeze([
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.git/**',
  '**/*.d.ts',
  '**/.next/**',
  '**/out/**',
]);
