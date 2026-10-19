import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { extractWithDepcruise } from './extract.js';

const loaded = vi.hoisted(() => ({ count: 0 }));

vi.mock('dependency-cruiser', () => {
  loaded.count += 1;
  throw new Error('dependency-cruiser must not be loaded');
});
vi.mock('dependency-cruiser/config-utl/extract-depcruise-config', () => {
  loaded.count += 1;
  throw new Error('dependency-cruiser config helper must not be loaded');
});

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'lr-depcruise-lazy-')));
mkdirSync(path.join(root, 'src'), { recursive: true });
writeFileSync(path.join(root, 'src/a.ts'), "import axios from 'axios';\nexport default axios;\n");
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('lazy loading', () => {
  it('does not load dependency-cruiser when the prefilter leaves no files', async () => {
    const result = await extractWithDepcruise({
      root,
      cache: false,
      prefilter: ['moment'],
      depcruiseConfig: '.dependency-cruiser.cjs',
    });
    expect(result).toMatchObject({ imports: [], files: [], errors: [] });
    expect(result.engineVersion).toMatch(/^dependency-cruiser@/);
    expect(loaded.count).toBe(0);
  });

  it('does not load dependency-cruiser when no files are listed', async () => {
    const result = await extractWithDepcruise({ root, cache: false, files: ['src/missing.ts'] });
    expect(result.files).toEqual([]);
    expect(loaded.count).toBe(0);
  });

  it('would load it when files remain (proves the mock is wired)', async () => {
    await expect(extractWithDepcruise({ root, cache: false, prefilter: ['axios'] })).rejects.toThrow();
    expect(loaded.count).toBeGreaterThan(0);
  });
});
