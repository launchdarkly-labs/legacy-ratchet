import type {
  AdoptionCount,
  BaselineRevision,
  GroupPolicy,
  GroupReport,
  HistoryEntry,
  ImportSite,
  LegacyConfig,
  ReportSnapshot,
  ReportTotals,
} from './types.js';
import { compareStrings } from './util.js';

export interface BuildReportOptions {
  history?: HistoryEntry[];
  revision?: BaselineRevision;
  now?: Date;
  topFiles?: number;
  adoption?: readonly AdoptionCount[];
  sourceUrlTemplate?: string;
}

const START_HERE_LIMIT = 10;
export const UNOWNED = 'Unowned';

export function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

export function completePct(start: number, current: number): number {
  return start === 0 ? 100 : round1(((start - current) / start) * 100);
}

export function adoptionPct(newSites: number, sites: number): number | null {
  return newSites + sites === 0 ? null : round1((newSites / (newSites + sites)) * 100);
}

function timeOf(entry: HistoryEntry): number | undefined {
  const t = Date.parse(entry.generatedAt);
  return Number.isNaN(t) ? undefined : t;
}

function totalFor(entry: HistoryEntry, groupId: string): number | undefined {
  if (!Object.hasOwn(entry.totals, groupId)) return undefined;
  const value = entry.totals[groupId];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function groupStart(
  group: Pick<GroupPolicy, 'start'>,
  groupId: string,
  current: number,
  history: readonly HistoryEntry[],
): number {
  let start = group.start;
  if (start === undefined) {
    let earliest: { t: number; total: number } | undefined;
    for (const entry of history) {
      const t = timeOf(entry);
      const total = totalFor(entry, groupId);
      if (t === undefined || total === undefined) continue;
      if (earliest === undefined || t < earliest.t) earliest = { t, total };
    }
    start = earliest?.total ?? current;
  }
  return Math.max(start, current);
}

export function directoryOf(filePath: string): string {
  const segments = filePath.split('/');
  if (segments.length <= 1) return '.';
  if (segments.length === 2) return segments[0]!;
  return `${segments[0]}/${segments[1]}`;
}

function sortedRecord(counts: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of [...counts.keys()].sort(compareStrings)) out[key] = counts.get(key)!;
  return out;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function buildReport(
  config: LegacyConfig,
  sites: readonly ImportSite[],
  opts: BuildReportOptions = {},
): ReportSnapshot {
  const limit = opts.topFiles ?? 10;
  const history = opts.history ?? [];
  const included = sites.filter((s) => Object.hasOwn(config.groups, s.groupId));

  const adoptionByGroup = new Map<string, Set<string>>();
  for (const a of opts.adoption ?? []) {
    if (!Object.hasOwn(config.groups, a.groupId)) continue;
    let keys = adoptionByGroup.get(a.groupId);
    if (!keys) {
      keys = new Set();
      adoptionByGroup.set(a.groupId, keys);
    }
    keys.add(`${a.filePath}|${a.packageName}`);
  }

  const groups: GroupReport[] = Object.entries(config.groups).map(([id, group]) => {
    const groupSites = included.filter((s) => s.groupId === id);
    const byPackage: Record<string, number> = {};
    const byFile = new Map<string, number>();
    const byOwner = new Map<string, number>();
    const byDirectory = new Map<string, number>();
    const fallbackOwner = group.owner !== undefined && group.owner.trim() !== '' ? group.owner : UNOWNED;
    for (const s of groupSites) {
      byPackage[s.packageName] = (byPackage[s.packageName] ?? 0) + 1;
      increment(byFile, s.filePath);
      increment(byDirectory, directoryOf(s.filePath));
      const owners = s.owners && s.owners.length > 0 ? new Set(s.owners) : [fallbackOwner];
      for (const owner of owners) increment(byOwner, owner);
    }
    const files = [...byFile].map(([filePath, count]) => ({ filePath, count }));
    const topFiles = [...files]
      .sort((a, b) => b.count - a.count || compareStrings(a.filePath, b.filePath))
      .slice(0, Math.max(0, limit));
    const startHere = [...files]
      .sort((a, b) => a.count - b.count || compareStrings(a.filePath, b.filePath))
      .slice(0, START_HERE_LIMIT);

    const current = groupSites.length;
    const start = groupStart(group, id, current, history);
    const newSites = adoptionByGroup.get(id)?.size ?? 0;

    const report: GroupReport = {
      id,
      mode: group.enforcement.mode,
      old: [...group.old],
      new: [...group.new],
      sites: current,
      files: byFile.size,
      byPackage,
      topFiles,
      start,
      completePct: completePct(start, current),
      newSites,
      adoptionPct: group.new.length === 0 ? null : adoptionPct(newSites, current),
      byOwner: sortedRecord(byOwner),
      byDirectory: sortedRecord(byDirectory),
      startHere,
    };
    if (group.description !== undefined) report.description = group.description;
    if (group.owner !== undefined) report.owner = group.owner;
    if (group.docs !== undefined) report.docs = group.docs;
    return report;
  });

  const totalStart = groups.reduce((n, g) => n + g.start, 0);
  const totalNew = groups.reduce((n, g) => n + g.newSites, 0);
  const adoptable = groups.filter((g) => g.new.length > 0);
  const adoptableSites = adoptable.reduce((n, g) => n + g.sites, 0);
  const totals: ReportTotals = {
    sites: included.length,
    start: totalStart,
    completePct: completePct(totalStart, included.length),
    newSites: totalNew,
    adoptionPct: adoptable.length === 0 ? null : adoptionPct(totalNew, adoptableSites),
  };

  const snapshot: ReportSnapshot = {
    schemaVersion: 2,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    totalSites: included.length,
    groups,
    sites: included,
    history,
    totals,
  };
  if (opts.revision) snapshot.revision = opts.revision;
  if (opts.sourceUrlTemplate !== undefined && opts.sourceUrlTemplate !== '') {
    snapshot.sourceUrlTemplate = opts.sourceUrlTemplate;
  }
  return snapshot;
}

export function historyEntry(report: ReportSnapshot): HistoryEntry {
  const totals: Record<string, number> = {};
  const newTotals: Record<string, number> = {};
  for (const g of report.groups) {
    totals[g.id] = g.sites;
    newTotals[g.id] = g.newSites ?? 0;
  }
  const entry: HistoryEntry = { generatedAt: report.generatedAt, identityVersion: 2, totals, newTotals };
  if (report.revision) entry.revision = report.revision;
  return entry;
}
