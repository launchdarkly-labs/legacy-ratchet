import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { extractWithDepcruise, TYPESCRIPT_UNAVAILABLE_WARNING, typescriptAvailable } from './extract.js';

const state = vi.hoisted(() => ({ hideTypescript: false }));

vi.mock('dependency-cruiser', async () => {
  const actual = await vi.importActual<typeof import('dependency-cruiser')>('dependency-cruiser');
  return {
    ...actual,
    getAvailableTranspilers: () =>
      actual
        .getAvailableTranspilers()
        .map((t) => (state.hideTypescript && t.name === 'typescript' ? { ...t, available: false } : t)),
  };
});

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'lr-depcruise-ts-')));
mkdirSync(path.join(root, 'src'), { recursive: true });
writeFileSync(path.join(root, 'src/a.ts'), "import moment from 'moment';\nexport default moment;\n");
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => {
  state.hideTypescript = false;
});

describe('typescript availability guard', () => {
  it('does not warn when dependency-cruiser can load typescript', async () => {
    const result = await extractWithDepcruise({ root, cache: false });
    expect(result.warnings).not.toContain(TYPESCRIPT_UNAVAILABLE_WARNING);
    expect(result.imports.map((i) => i.moduleSpecifier)).toEqual(['moment']);
  });

  it('warns when dependency-cruiser reports typescript as unavailable', async () => {
    state.hideTypescript = true;
    const result = await extractWithDepcruise({ root, cache: false });
    expect(result.warnings).toContain(TYPESCRIPT_UNAVAILABLE_WARNING);
  });

  it('typescriptAvailable reads the transpiler list', () => {
    expect(typescriptAvailable([{ name: 'typescript', available: true }])).toBe(true);
    expect(typescriptAvailable([{ name: 'typescript', available: false }])).toBe(false);
    expect(typescriptAvailable([{ name: 'babel', available: true }])).toBe(false);
  });
});
