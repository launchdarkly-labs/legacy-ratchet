import type { BaselineRevision, GroupReport, HistoryEntry, ImportSite, LegacyConfig, ReportSnapshot } from './types.js';
import { compareStrings } from './util.js';

export function buildReport(
  config: LegacyConfig,
  sites: readonly ImportSite[],
  opts: { history?: HistoryEntry[]; revision?: BaselineRevision; now?: Date; topFiles?: number } = {},
): ReportSnapshot {
  const limit = opts.topFiles ?? 10;
  const included = sites.filter((s) => Object.hasOwn(config.groups, s.groupId));

  const groups: GroupReport[] = Object.entries(config.groups).map(([id, group]) => {
    const groupSites = included.filter((s) => s.groupId === id);
    const byPackage: Record<string, number> = {};
    const byFile = new Map<string, number>();
    for (const s of groupSites) {
      byPackage[s.packageName] = (byPackage[s.packageName] ?? 0) + 1;
      byFile.set(s.filePath, (byFile.get(s.filePath) ?? 0) + 1);
    }
    const topFiles = [...byFile]
      .map(([filePath, count]) => ({ filePath, count }))
      .sort((a, b) => b.count - a.count || compareStrings(a.filePath, b.filePath))
      .slice(0, Math.max(0, limit));

    const report: GroupReport = {
      id,
      mode: group.enforcement.mode,
      old: [...group.old],
      new: [...group.new],
      sites: groupSites.length,
      files: byFile.size,
      byPackage,
      topFiles,
    };
    if (group.description !== undefined) report.description = group.description;
    if (group.owner !== undefined) report.owner = group.owner;
    if (group.docs !== undefined) report.docs = group.docs;
    return report;
  });

  const snapshot: ReportSnapshot = {
    schemaVersion: 2,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    totalSites: included.length,
    groups,
    sites: included,
    history: opts.history ?? [],
  };
  if (opts.revision) snapshot.revision = opts.revision;
  return snapshot;
}

export function historyEntry(report: ReportSnapshot): HistoryEntry {
  const totals: Record<string, number> = {};
  for (const g of report.groups) totals[g.id] = g.sites;
  const entry: HistoryEntry = { generatedAt: report.generatedAt, identityVersion: 2, totals };
  if (report.revision) entry.revision = report.revision;
  return entry;
}
