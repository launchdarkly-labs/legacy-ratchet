import { describe, expect, it } from 'vitest';
import { collectSites, createBaseline, evaluate } from './index.js';
import type { Baseline, ImportSite, LegacyConfig } from './index.js';
import { config, raw } from './__fixtures__/helpers.js';

const now = new Date('2026-03-15T12:00:00Z');

function makeConfig(mode: string, extra: Record<string, unknown> = {}, severity = 'error'): LegacyConfig {
  return config({
    version: 1,
    groups: {
      forms: {
        old: ['redux-form'],
        new: ['react-hook-form'],
        docs: 'https://example.com/forms',
        enforcement: { mode, severity },
      },
      dates: { old: ['moment'], new: [], enforcement: { mode } },
    },
    ...extra,
  });
}

const baselineOf = (cfg: LegacyConfig, sites: readonly ImportSite[]): Baseline =>
  createBaseline(sites, { config: cfg, scannerVersion: '0.1.0', now });

describe('evaluate: modes', () => {
  it('report mode never violates', () => {
    const cfg = makeConfig('report');
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1), raw('src/a.ts', 'moment', 2)]);
    const result = evaluate(cfg, sites, undefined, { now });
    expect(result.violations).toEqual([]);
    expect(result.existing).toEqual([]);
    expect(result.failed).toBe(false);
    expect(result.groups).toEqual([
      { groupId: 'forms', mode: 'report', remaining: 1, retired: 0, newSites: 0 },
      { groupId: 'dates', mode: 'report', remaining: 1, retired: 0, newSites: 0 },
    ]);
  });

  it('ratchet without a baseline: every site is new', () => {
    const cfg = makeConfig('ratchet');
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]);
    const result = evaluate(cfg, sites, undefined, { now });
    expect(result.violations).toEqual([
      {
        site: sites[0],
        reason: 'new-site',
        severity: 'error',
        message: 'New import of "redux-form" is not allowed.',
        replacements: ['react-hook-form'],
        docs: 'https://example.com/forms',
      },
    ]);
    expect(result.failed).toBe(true);
  });

  it('ratchet with a baseline: baselined sites are existing, others are new', () => {
    const cfg = makeConfig('ratchet');
    const before = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1), raw('src/b.ts', 'moment', 1)]);
    const baseline = baselineOf(cfg, before);
    const after = collectSites(cfg, [
      raw('src/a.ts', 'redux-form', 5),
      raw('src/b.ts', 'moment', 3),
      raw('src/b.ts', 'moment', 9),
      raw('src/b.ts', 'moment/locale/fr', 10),
      raw('src/c.ts', 'redux-form', 1),
      raw('src/d.ts', 'moment', 1),
    ]);
    const result = evaluate(cfg, after, baseline, { now });
    expect(result.existing.map((s) => s.id)).toEqual([
      'dates|src/b.ts|import|moment',
      'dates|src/b.ts|import|moment/locale/fr',
      'forms|src/a.ts|import|redux-form',
    ]);
    expect(result.violations.map((v) => [v.site.id, v.reason])).toEqual([
      ['dates|src/d.ts|import|moment', 'new-site'],
      ['forms|src/c.ts|import|redux-form', 'new-site'],
    ]);
    expect(result.violations[0]).not.toHaveProperty('docs');
    expect(result.violations[0]?.replacements).toEqual([]);
    expect(result.groups).toEqual([
      { groupId: 'forms', mode: 'ratchet', remaining: 2, retired: 0, newSites: 1 },
      { groupId: 'dates', mode: 'ratchet', remaining: 3, retired: 0, newSites: 1 },
    ]);
    expect(result.failed).toBe(true);
  });

  it('ratchet: another legacy specifier of the same group in an allowed file is existing', () => {
    const cfg = config({
      version: 1,
      groups: {
        forms: { old: ['redux-form', 'redux-form-validators'], new: [], enforcement: { mode: 'ratchet' } },
        dates: { old: ['moment'], new: [], enforcement: { mode: 'ratchet' } },
      },
    });
    const baseline = baselineOf(cfg, collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]));
    const after = collectSites(cfg, [
      raw('src/a.ts', 'redux-form', 1),
      raw('src/a.ts', 'redux-form-validators', 2),
      raw('src/a.ts', 'moment', 3),
    ]);
    const result = evaluate(cfg, after, baseline, { now });
    expect(result.existing.map((s) => s.id)).toEqual([
      'forms|src/a.ts|import|redux-form',
      'forms|src/a.ts|import|redux-form-validators',
    ]);
    expect(result.violations.map((v) => v.site.id)).toEqual(['dates|src/a.ts|import|moment']);
  });

  it('ratchet passes when nothing new', () => {
    const cfg = makeConfig('ratchet');
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]);
    const result = evaluate(cfg, sites, baselineOf(cfg, sites), { now });
    expect(result.violations).toEqual([]);
    expect(result.failed).toBe(false);
  });

  it('ban mode: every site is banned regardless of baseline', () => {
    const cfg = makeConfig('ban');
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1), raw('src/a.ts', 'moment', 2)]);
    const result = evaluate(cfg, sites, baselineOf(cfg, sites), { now });
    expect(result.violations.map((v) => [v.reason, v.message])).toEqual([
      ['banned', 'Import of "moment" is banned.'],
      ['banned', 'Import of "redux-form" is banned.'],
    ]);
    expect(result.existing).toEqual([]);
    expect(result.failed).toBe(true);
  });

  it('severity warn violations do not fail', () => {
    const cfg = config({
      version: 1,
      groups: { forms: { old: ['redux-form'], enforcement: { mode: 'ban', severity: 'warn' } } },
    });
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]);
    const result = evaluate(cfg, sites, undefined, { now });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.severity).toBe('warn');
    expect(result.failed).toBe(false);
  });

  it('ignores sites whose group is not in config', () => {
    const cfg = makeConfig('ban');
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]).map((s) => ({ ...s, groupId: 'gone' }));
    const result = evaluate(cfg, sites, undefined, { now });
    expect(result.violations).toEqual([]);
    expect(result.groups.every((g) => g.remaining === 0)).toBe(true);
  });

  it('defaults now to the current date', () => {
    const cfg = makeConfig('ban');
    expect(evaluate(cfg, [], undefined).failed).toBe(false);
  });
});

describe('evaluate: suppressions', () => {
  const cfg = makeConfig('ban');
  const sitesWith = (groupIds: string[], reason: string) =>
    collectSites(cfg, [raw('src/a.ts', 'redux-form', 2, { suppression: { groupIds, reason } })]);

  it('suppresses with a reason and empty groupIds', () => {
    const result = evaluate(cfg, sitesWith([], 'temporary'), undefined, { now });
    expect(result.violations).toEqual([]);
    expect(result.suppressed).toHaveLength(1);
    expect(result.failed).toBe(false);
    expect(result.groups[0]).toMatchObject({ remaining: 1, newSites: 0 });
  });

  it('suppresses when groupIds includes the site group', () => {
    expect(evaluate(cfg, sitesWith(['dates', 'forms'], 'ok'), undefined, { now }).suppressed).toHaveLength(1);
  });

  it('does not suppress when groupIds excludes the site group', () => {
    const result = evaluate(cfg, sitesWith(['dates'], 'ok'), undefined, { now });
    expect(result.suppressed).toEqual([]);
    expect(result.violations).toHaveLength(1);
  });

  it('does not suppress with an empty or blank reason', () => {
    for (const reason of ['', '   ']) {
      const result = evaluate(cfg, sitesWith([], reason), undefined, { now });
      expect(result.suppressed).toEqual([]);
      expect(result.violations).toHaveLength(1);
    }
  });

  it('lists suppressed sites even in report mode', () => {
    const reportCfg = makeConfig('report');
    const sites = collectSites(reportCfg, [raw('src/a.ts', 'moment', 1, { suppression: { groupIds: [], reason: 'x' } })]);
    expect(evaluate(reportCfg, sites, undefined, { now }).suppressed).toHaveLength(1);
  });
});

describe('evaluate: exceptions', () => {
  const exception = (files: string[], expires: string, groupId = 'forms') => ({
    groupId,
    files,
    reason: 'migration in progress',
    owner: '@forms',
    expires,
  });

  it('excuses sites matched by a glob (dot files included)', () => {
    const cfg = makeConfig('ban', { exceptions: [exception(['src/legacy/**'], '2026-12-31')] });
    const sites = collectSites(cfg, [
      raw('src/legacy/.hidden/a.ts', 'redux-form', 1),
      raw('src/legacy/b.ts', 'redux-form', 1),
      raw('src/legacy/b.ts', 'moment', 2),
      raw('src/new/c.ts', 'redux-form', 1),
    ]);
    const result = evaluate(cfg, sites, undefined, { now });
    expect(result.appliedExceptions.map((a) => a.site.id)).toEqual([
      'forms|src/legacy/.hidden/a.ts|import|redux-form',
      'forms|src/legacy/b.ts|import|redux-form',
    ]);
    expect(result.appliedExceptions[0]?.exception).toBe(cfg.exceptions?.[0]);
    expect(result.violations.map((v) => v.site.id)).toEqual(['dates|src/legacy/b.ts|import|moment', 'forms|src/new/c.ts|import|redux-form']);
    expect(result.expiredExceptions).toEqual([]);
  });

  it('is still valid on its expiry day (UTC)', () => {
    const cfg = makeConfig('ban', { exceptions: [exception(['src/**'], '2026-03-15')] });
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]);
    const lateUtc = new Date('2026-03-15T23:59:59Z');
    const result = evaluate(cfg, sites, undefined, { now: lateUtc });
    expect(result.appliedExceptions).toHaveLength(1);
    expect(result.expiredExceptions).toEqual([]);
    expect(result.failed).toBe(false);
  });

  it('expired exceptions fail and do not excuse', () => {
    const cfg = makeConfig('ratchet', {
      exceptions: [exception(['src/other/**'], '2030-01-01'), exception(['src/**'], '2026-03-14')],
    });
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]);
    const result = evaluate(cfg, sites, baselineOf(cfg, sites), { now });
    expect(result.expiredExceptions).toEqual([{ exception: cfg.exceptions?.[1], index: 1 }]);
    expect(result.appliedExceptions).toEqual([]);
    expect(result.violations).toEqual([]);
    expect(result.existing).toHaveLength(1);
    expect(result.failed).toBe(true);
  });

  it('expired exception in ban mode leaves the site banned', () => {
    const cfg = makeConfig('ban', { exceptions: [exception(['src/**'], '2025-01-01')] });
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1)]);
    const result = evaluate(cfg, sites, undefined, { now });
    expect(result.violations).toHaveLength(1);
    expect(result.appliedExceptions).toEqual([]);
  });

  it('only applies to its own group', () => {
    const cfg = makeConfig('ban', { exceptions: [exception(['**'], '2030-01-01', 'dates')] });
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1), raw('src/a.ts', 'moment', 2)]);
    const result = evaluate(cfg, sites, undefined, { now });
    expect(result.appliedExceptions.map((a) => a.site.groupId)).toEqual(['dates']);
    expect(result.violations.map((v) => v.site.groupId)).toEqual(['forms']);
  });

  it('suppression takes precedence over exceptions', () => {
    const cfg = makeConfig('ban', { exceptions: [exception(['**'], '2030-01-01')] });
    const sites = collectSites(cfg, [raw('src/a.ts', 'redux-form', 1, { suppression: { groupIds: [], reason: 'r' } })]);
    const result = evaluate(cfg, sites, undefined, { now });
    expect(result.suppressed).toHaveLength(1);
    expect(result.appliedExceptions).toEqual([]);
  });
});

describe('evaluate: retired', () => {
  it('lists baselined ids no longer present in a file with no other site of the group, sorted, ignoring removed groups', () => {
    const cfg = makeConfig('ratchet');
    const before = collectSites(cfg, [
      raw('src/b.ts', 'redux-form', 1),
      raw('src/a.ts', 'redux-form', 1),
      raw('src/a.ts', 'moment', 2),
      raw('src/a.ts', 'moment/locale/fr', 3),
    ]);
    const baseline: Baseline = {
      ...baselineOf(cfg, before),
      allowed: [...baselineOf(cfg, before).allowed, 'removed-group|src/x.ts|import|x', 'not-a-site-id'],
    };
    const after = collectSites(cfg, [raw('src/a.ts', 'moment', 2)]);
    const result = evaluate(cfg, after, baseline, { now });
    expect(result.retired).toEqual(['forms|src/a.ts|import|redux-form', 'forms|src/b.ts|import|redux-form']);
    expect(result.groups).toEqual([
      { groupId: 'forms', mode: 'ratchet', remaining: 0, retired: 2, newSites: 0 },
      { groupId: 'dates', mode: 'ratchet', remaining: 1, retired: 0, newSites: 0 },
    ]);
    expect(result.failed).toBe(false);
  });

  it('is empty without a baseline', () => {
    const cfg = makeConfig('ratchet');
    expect(evaluate(cfg, [], undefined, { now }).retired).toEqual([]);
  });
});
