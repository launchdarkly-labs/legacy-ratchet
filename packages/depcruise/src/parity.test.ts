import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSites, parseConfig } from '@migration-tracker/core';
import type { LegacyConfig } from '@migration-tracker/core';
import { scanFiles } from '@migration-tracker/scanner';
import { afterAll, describe, expect, it } from 'vitest';
import { extractWithDepcruise } from './extract.js';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

function loadConfig(path: string): LegacyConfig {
  const parsed = parseConfig(readFileSync(path, 'utf8'));
  if (!parsed.ok) throw new Error(`invalid config ${path}: ${JSON.stringify(parsed.issues)}`);
  return parsed.config;
}

const fixtureConfig: LegacyConfig = {
  version: 1,
  groups: {
    forms: { old: ['redux-form'], new: ['react-hook-form'], enforcement: { mode: 'ratchet', scope: 'imports', severity: 'error' } },
    dates: { old: ['moment'], new: ['date-fns'], enforcement: { mode: 'ratchet', scope: 'imports', severity: 'error' } },
    charts: { old: ['old-charts'], new: [], enforcement: { mode: 'report', scope: 'imports', severity: 'error' } },
    react: { old: ['react'], new: [], enforcement: { mode: 'report', scope: 'imports', severity: 'error' } },
  },
};

interface ParityCase {
  name: string;
  root: string;
  config: LegacyConfig;
  allowlist: Array<{ id: string; engine: 'depcruise' | 'scanner'; reason: string }>;
}

const zooFiles: Record<string, string> = {
  'src/decl.ts': "declare module 'augmented' {\n  import { X } from 'moment';\n  export const y: X;\n}\nexport {};\n",
  'src/typeimp.ts': "export type M = typeof import('axios');\n",
  'src/nested.ts': "export function f() {\n  const m = require('moment');\n  return import('axios').then(() => m);\n}\n",
  'src/modern.jsx':
    "import moment from 'moment';\nclass A { #x = 1; static y = 2; }\nlet z = null; z ??= 3;\nawait Promise.resolve();\nexport default function C() { return <div>{moment().format()}</div>; }\nconst r = require('axios');\n",
  'src/broken.jsx': "import moment from 'moment';\nexport default function C() { return <div>{ </div>; }\nimport axios from 'axios';\n",
  'src/tmpl.ts': "const a = require(`moment`);\nconst b = import(`axios`);\nconst c = require('request' + '');\nexport { a, b, c };\n",
  'src/cjs.cjs': "const x = require('moment'); module.exports = x;\n",
  'src/reexp.mts': "export { default } from 'moment';\nexport * as ax from 'axios';\n",
  'src/equals.cts': "import moment = require('moment');\nimport type axios = require('axios');\nexport = moment;\n",
  'src/types.d.ts': "import 'moment';\n",
};

const zooRoot = realpathSync(mkdtempSync(nodePath.join(tmpdir(), 'lr-depcruise-zoo-')));
for (const [rel, text] of Object.entries(zooFiles)) {
  mkdirSync(nodePath.dirname(nodePath.join(zooRoot, rel)), { recursive: true });
  writeFileSync(nodePath.join(zooRoot, rel), text);
}
afterAll(() => rmSync(zooRoot, { recursive: true, force: true }));

const zooConfig: LegacyConfig = {
  version: 1,
  groups: {
    dates: { old: ['moment'], new: [], enforcement: { mode: 'ratchet', scope: 'imports', severity: 'error' } },
    http: { old: ['axios', 'request'], new: [], enforcement: { mode: 'ratchet', scope: 'imports', severity: 'error' } },
  },
};

const cases: ParityCase[] = [
  {
    name: 'examples/vite-react',
    root: at('../../../examples/vite-react'),
    config: loadConfig(at('../../../examples/vite-react/migrations.json')),
    allowlist: [],
  },
  {
    name: 'examples/pnpm-monorepo',
    root: at('../../../examples/pnpm-monorepo'),
    config: loadConfig(at('../../../examples/pnpm-monorepo/migrations.json')),
    allowlist: [],
  },
  {
    name: 'scanner fixture repo',
    root: at('../../scanner/src/__fixtures__/repo'),
    config: fixtureConfig,
    allowlist: [],
  },
  {
    name: 'syntax zoo',
    root: zooRoot,
    config: zooConfig,
    allowlist: [
      {
        id: 'dates|src/decl.ts|import|moment',
        engine: 'scanner',
        reason: 'dependency-cruiser only reads top-level import statements, so imports inside `declare module` blocks are missed',
      },
      {
        id: 'http|src/typeimp.ts|import|axios',
        engine: 'depcruise',
        reason: 'an unresolvable `typeof import()` type loses its type-import dependency type (depcruise reports only "unknown"), so it reads as an es6 import',
      },
    ],
  },
];

describe.each(cases)('depcruise vs scanner site ids: $name', ({ root, config, allowlist }) => {
  it('produces the same site ids', async () => {
    const ignore = config.ignore ?? [];
    const scanned = await scanFiles({ root, ignore });
    expect(scanned.errors).toEqual([]);
    const cruised = await extractWithDepcruise({ root, ignore, cache: false });
    expect(cruised.errors).toEqual([]);

    const scannerIds = collectSites(config, scanned.imports).map((s) => s.id);
    const depcruiseIds = collectSites(config, cruised.imports).map((s) => s.id);
    expect(scannerIds.length).toBeGreaterThan(0);

    const allowed = (engine: 'depcruise' | 'scanner', id: string) => allowlist.some((a) => a.engine === engine && a.id === id);
    const onlyDepcruise = depcruiseIds.filter((id) => !scannerIds.includes(id) && !allowed('depcruise', id));
    const onlyScanner = scannerIds.filter((id) => !depcruiseIds.includes(id) && !allowed('scanner', id));
    expect({ onlyDepcruise, onlyScanner }).toEqual({ onlyDepcruise: [], onlyScanner: [] });
    for (const a of allowlist) {
      const [mine, theirs] = a.engine === 'depcruise' ? [depcruiseIds, scannerIds] : [scannerIds, depcruiseIds];
      expect({ id: a.id, inEngine: mine.includes(a.id), inOther: theirs.includes(a.id) }).toEqual({ id: a.id, inEngine: true, inOther: false });
    }
    expect(depcruiseIds.filter((id) => !allowed('depcruise', id))).toEqual(scannerIds.filter((id) => !allowed('scanner', id)));
  });

  it('lists the same files', async () => {
    const ignore = config.ignore ?? [];
    const scanned = await scanFiles({ root, ignore });
    const cruised = await extractWithDepcruise({ root, ignore, cache: false });
    expect(cruised.files.length).toBe(scanned.files);
  });
});
