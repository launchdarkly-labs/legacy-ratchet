import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@legacy-ratchet/core': src('core'),
      '@legacy-ratchet/scanner': src('scanner'),
      '@legacy-ratchet/depcruise/map': fileURLToPath(new URL('./packages/depcruise/src/map.ts', import.meta.url)),
      '@legacy-ratchet/depcruise': src('depcruise'),
      'eslint-plugin-legacy-ratchet': src('eslint-plugin'),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: 'core', include: ['packages/core/**/*.test.ts'] } },
      { extends: true, test: { name: 'scanner', include: ['packages/scanner/**/*.test.ts'] } },
      { extends: true, test: { name: 'depcruise', include: ['packages/depcruise/**/*.test.ts'], testTimeout: 60000 } },
      { extends: true, test: { name: 'cli', include: ['packages/cli/**/*.test.ts'], testTimeout: 30000 } },
      { extends: true, test: { name: 'eslint-plugin', include: ['packages/eslint-plugin/**/*.test.ts'] } },
      { extends: true, test: { name: 'dashboard', include: ['packages/dashboard/**/*.test.{ts,tsx}'], environment: 'jsdom' } },
    ],
  },
});
