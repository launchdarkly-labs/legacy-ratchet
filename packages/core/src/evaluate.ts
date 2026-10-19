import picomatch from 'picomatch';
import { parseSiteId } from './identity.js';
import type {
  AppliedException,
  Baseline,
  CheckResult,
  ExpiredException,
  GroupCheckSummary,
  GroupPolicy,
  ImportSite,
  LegacyConfig,
  PolicyException,
  Violation,
  ViolationReason,
} from './types.js';
import { sortedUnique, utcDay } from './util.js';

export function isSuppressed(site: ImportSite): boolean {
  const s = site.suppression;
  if (!s || s.reason.trim() === '') return false;
  return s.groupIds.length === 0 || s.groupIds.includes(site.groupId);
}

function violationMessage(reason: ViolationReason, spec: string): string {
  return reason === 'new-site' ? `New import of "${spec}" is not allowed.` : `Import of "${spec}" is banned.`;
}

function makeViolation(site: ImportSite, group: GroupPolicy, reason: ViolationReason): Violation {
  const violation: Violation = {
    site,
    reason,
    severity: group.enforcement.severity,
    message: violationMessage(reason, site.moduleSpecifier),
    replacements: [...group.new],
  };
  if (group.docs !== undefined) violation.docs = group.docs;
  return violation;
}

export function evaluate(
  config: LegacyConfig,
  sites: readonly ImportSite[],
  baseline: Baseline | undefined,
  opts: { now?: Date } = {},
): CheckResult {
  const today = utcDay(opts.now ?? new Date());

  const active: Array<{ exception: PolicyException; matches: (path: string) => boolean }> = [];
  const expiredExceptions: ExpiredException[] = [];
  (config.exceptions ?? []).forEach((exception, index) => {
    if (exception.expires < today) {
      expiredExceptions.push({ exception, index });
    } else {
      active.push({ exception, matches: picomatch(exception.files, { dot: true }) });
    }
  });

  const allowed = new Set(baseline?.allowed ?? []);
  const violations: Violation[] = [];
  const existing: ImportSite[] = [];
  const suppressed: ImportSite[] = [];
  const appliedExceptions: AppliedException[] = [];
  const remaining = new Map<string, number>();
  const newSites = new Map<string, number>();

  for (const site of sites) {
    const group = Object.hasOwn(config.groups, site.groupId) ? config.groups[site.groupId] : undefined;
    if (!group) continue;
    remaining.set(site.groupId, (remaining.get(site.groupId) ?? 0) + 1);

    if (isSuppressed(site)) {
      suppressed.push(site);
      continue;
    }
    const applied = active.find((a) => a.exception.groupId === site.groupId && a.matches(site.filePath));
    if (applied) {
      appliedExceptions.push({ exception: applied.exception, site });
      continue;
    }

    const { mode } = group.enforcement;
    let violation: Violation | undefined;
    if (mode === 'ban') {
      violation = makeViolation(site, group, 'banned');
    } else if (mode === 'ratchet') {
      if (baseline === undefined || !allowed.has(site.id)) violation = makeViolation(site, group, 'new-site');
      else existing.push(site);
    }
    if (violation) {
      violations.push(violation);
      newSites.set(site.groupId, (newSites.get(site.groupId) ?? 0) + 1);
    }
  }

  const presentIds = new Set(sites.map((s) => s.id));
  const retiredByGroup = new Map<string, number>();
  const retired = sortedUnique(
    [...allowed].filter((id) => {
      if (presentIds.has(id)) return false;
      let groupId: string;
      try {
        groupId = parseSiteId(id).groupId;
      } catch {
        return false;
      }
      if (!Object.hasOwn(config.groups, groupId)) return false;
      retiredByGroup.set(groupId, (retiredByGroup.get(groupId) ?? 0) + 1);
      return true;
    }),
  );

  const groups: GroupCheckSummary[] = Object.entries(config.groups).map(([groupId, group]) => ({
    groupId,
    mode: group.enforcement.mode,
    remaining: remaining.get(groupId) ?? 0,
    retired: retiredByGroup.get(groupId) ?? 0,
    newSites: newSites.get(groupId) ?? 0,
  }));

  const failed = violations.some((v) => v.severity === 'error') || expiredExceptions.length > 0;

  return { violations, retired, existing, suppressed, appliedExceptions, expiredExceptions, groups, failed };
}
