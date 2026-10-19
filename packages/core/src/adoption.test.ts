import { describe, expect, it } from 'vitest';

import { config, raw } from './__fixtures__/helpers.js';
import { collectAdoption } from './index.js';
import type { LegacyConfig } from './index.js';

const cfg = config({
  version: 1,
  groups: {
    forms: { old: ['redux-form'], new: ['react-hook-form', '@acme/forms'] },
    dates: { old: ['moment'], new: ['date-fns', '@acme/forms'] },
    http: { old: ['request'] },
  },
});

describe('collectAdoption', () => {
  it('counts each new package once per group and file', () => {
    const result = collectAdoption(cfg, [
      raw('src/b.ts', 'react-hook-form', 1),
      raw('src/b.ts', 'react-hook-form', 2, { importKind: 'require' }),
      raw('./src/a.ts', 'date-fns/format', 1),
      raw('src/a.ts', 'date-fns', 2),
      raw('src/a.ts', 'redux-form', 3),
      raw('src/a.ts', 'moment', 4),
    ]);
    expect(result).toEqual([
      { groupId: 'dates', filePath: 'src/a.ts', packageName: 'date-fns' },
      { groupId: 'forms', filePath: 'src/b.ts', packageName: 'react-hook-form' },
    ]);
  });

  it('counts a package listed in several groups for each group', () => {
    expect(collectAdoption(cfg, [raw('src/x.ts', '@acme/forms/field', 1)])).toEqual([
      { groupId: 'dates', filePath: 'src/x.ts', packageName: '@acme/forms' },
      { groupId: 'forms', filePath: 'src/x.ts', packageName: '@acme/forms' },
    ]);
  });

  it('uses exact or subpath matching and never matches relative specifiers or prefixes', () => {
    expect(
      collectAdoption(cfg, [
        raw('src/x.ts', 'react-hook-form-extra', 1),
        raw('src/x.ts', './react-hook-form', 2),
        raw('src/x.ts', '../date-fns', 3),
        raw('src/x.ts', 'node:date-fns', 4),
      ]),
    ).toEqual([]);
  });

  it('prefers the longest new package', () => {
    const c = config({ version: 1, groups: { ui: { old: ['old-ui'], new: ['@acme/ui', '@acme/ui-kit'] } } });
    expect(collectAdoption(c, [raw('a.ts', '@acme/ui-kit/button', 1)])).toEqual([
      { groupId: 'ui', filePath: 'a.ts', packageName: '@acme/ui-kit' },
    ]);
  });

  it('never counts a package that is also in the group old list', () => {
    const unvalidated: LegacyConfig = {
      version: 1,
      groups: {
        g: { old: ['lodash'], new: ['lodash'], enforcement: { mode: 'report', scope: 'imports', severity: 'error' } },
      },
    };
    expect(collectAdoption(unvalidated, [raw('a.ts', 'lodash', 1)])).toEqual([]);
  });
});
