import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASELINE_PATH, CONFIG_FILENAME, CORE_VERSION, HISTORY_PATH } from './index.js';

describe('constants', () => {
  it('CORE_VERSION matches package.json version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(CORE_VERSION).toBe(pkg.version);
  });

  it('exposes well-known paths', () => {
    expect(CONFIG_FILENAME).toBe('migrations.json');
    expect(BASELINE_PATH).toBe('.migrations/baseline.json');
    expect(HISTORY_PATH).toBe('.migrations/history.jsonl');
  });
});
