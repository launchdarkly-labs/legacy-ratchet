import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBaseline, serializeBaseline, siteId, validateConfig, type LegacyConfig, type SiteKind } from '@legacy-ratchet/core';

export const CONFIG = {
  version: 1,
  groups: {
    forms: {
      old: ['redux-form'],
      new: ['react-hook-form'],
      enforcement: { mode: 'ratchet' },
      docs: 'https://example.com/forms',
    },
    dates: { old: ['moment'], new: ['date-fns', 'luxon'], enforcement: { mode: 'ratchet' } },
    http: { old: ['request'], new: [], enforcement: { mode: 'ban' } },
    utils: { old: ['lodash'], new: ['es-toolkit'], enforcement: { mode: 'report' } },
  },
  ignore: ['generated/**'],
  exceptions: [
    { groupId: 'forms', files: ['src/legacy/**'], reason: 'Old wizard', owner: 'team-a', expires: '2999-01-01' },
  ],
} as const;

export interface Allowed {
  groupId: string;
  filePath: string;
  importKind: SiteKind;
  moduleSpecifier: string;
}

export interface FixtureOptions {
  config?: unknown;
  /** Raw config text (overrides `config`). */
  configText?: string;
  /** Baseline allowed ids; `undefined` = no baseline file. */
  allowed?: Allowed[];
  baselineText?: string;
  files?: Record<string, string>;
}

/** Creates a temp project root and returns its real path. */
export function makeFixture(opts: FixtureOptions = {}): string {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'legacy-ratchet-eslint-')));
  const write = (rel: string, text: string): void => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  };
  write('legacy.json', opts.configText ?? JSON.stringify(opts.config ?? CONFIG, null, 2));
  if (opts.baselineText !== undefined) {
    write('.legacy/baseline.json', opts.baselineText);
  } else if (opts.allowed) {
    const validated = validateConfig(opts.config ?? CONFIG);
    if (!validated.ok) throw new Error('fixture config invalid');
    const config: LegacyConfig = validated.config;
    const baseline = createBaseline([], { config, scannerVersion: '0.0.0-test', now: new Date('2026-01-01T00:00:00Z') });
    baseline.allowed = opts.allowed.map((a) => siteId(a)).sort();
    write('.legacy/baseline.json', serializeBaseline(baseline));
  }
  for (const [rel, text] of Object.entries(opts.files ?? {})) write(rel, text);
  return root;
}
