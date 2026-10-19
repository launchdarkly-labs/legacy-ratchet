import type { BaselineRevision, GroupReport, ImportKind, ImportSite, ReportSnapshot, SiteKind } from '@legacy-ratchet/core';

export interface TrendPoint {
  generatedAt: string;
  revision?: BaselineRevision;
  totals: Record<string, number>;
  total: number;
  current: boolean;
  identityVersion?: 2;
}

export interface SeriesValue {
  generatedAt: string;
  value: number;
}

export const TOTAL_KEY = '__total__';

export const IDENTITY_CHANGE_NOTE = 'Counting changed: one site per file and package from here';

export const SITES_HINT = 'import sites (one per file and package)';

export type SeriesSnapshot = ReportSnapshot & { upgradedFrom?: 1 };

export function siteKindOf(kind: ImportKind): SiteKind {
  return kind === 'require' || kind === 'import-equals' ? 'require' : 'import';
}

function sumTotals(totals: Record<string, number>): number {
  let sum = 0;
  for (const value of Object.values(totals)) if (typeof value === 'number' && Number.isFinite(value)) sum += value;
  return sum;
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

export function buildSeries(snapshot: SeriesSnapshot): TrendPoint[] {
  const history = snapshot.history
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => timeOf(a.entry.generatedAt) - timeOf(b.entry.generatedAt) || a.index - b.index)
    .map(({ entry }) => entry);

  const points: TrendPoint[] = history.map((entry) => ({
    generatedAt: entry.generatedAt,
    revision: entry.revision,
    totals: entry.totals,
    total: sumTotals(entry.totals),
    current: false,
    ...(entry.identityVersion === 2 ? { identityVersion: 2 as const } : {}),
  }));

  const currentTotals: Record<string, number> = {};
  for (const group of snapshot.groups) currentTotals[group.id] = group.sites;
  const current: TrendPoint = {
    generatedAt: snapshot.generatedAt,
    revision: snapshot.revision,
    totals: currentTotals,
    total: snapshot.totalSites,
    current: true,
    ...(snapshot.upgradedFrom === 1 ? {} : { identityVersion: 2 as const }),
  };

  const last = points[points.length - 1];
  if (
    last &&
    (last.generatedAt === snapshot.generatedAt ||
      (timeOf(last.generatedAt) === timeOf(snapshot.generatedAt) && Number.isFinite(timeOf(last.generatedAt))))
  ) {
    points[points.length - 1] = current;
  } else {
    points.push(current);
  }
  return points;
}

export function identityChangeAt(points: readonly TrendPoint[]): string | undefined {
  for (let i = 1; i < points.length; i++) {
    if (points[i]?.identityVersion === 2 && points[i - 1]?.identityVersion !== 2) return points[i]?.generatedAt;
  }
  return undefined;
}

export function seriesFor(points: readonly TrendPoint[], key: string): SeriesValue[] {
  const out: SeriesValue[] = [];
  for (const point of points) {
    const value = key === TOTAL_KEY ? point.total : point.totals[key];
    if (typeof value === 'number' && Number.isFinite(value)) out.push({ generatedAt: point.generatedAt, value });
  }
  return out;
}

export function deltaFor(points: readonly TrendPoint[], key: string): number | undefined {
  const values = seriesFor(points, key);
  const last = values[values.length - 1];
  const previous = values[values.length - 2];
  if (!last || !previous) return undefined;
  return last.value - previous.value;
}

export const UNOWNED = 'Unowned';

export interface OwnerRow {
  owner: string;
  groups: GroupReport[];
  sites: number;
  files: number;
  delta: number | undefined;
}

export function ownerOf(group: GroupReport): string {
  const owner = group.owner?.trim();
  return owner ? owner : UNOWNED;
}

export function aggregateOwners(snapshot: ReportSnapshot, points: readonly TrendPoint[]): OwnerRow[] {
  const byOwner = new Map<string, GroupReport[]>();
  for (const group of snapshot.groups) {
    const owner = ownerOf(group);
    const list = byOwner.get(owner);
    if (list) list.push(group);
    else byOwner.set(owner, [group]);
  }

  const filesByGroup = new Map<string, Set<string>>();
  for (const site of snapshot.sites) {
    let set = filesByGroup.get(site.groupId);
    if (!set) filesByGroup.set(site.groupId, (set = new Set()));
    set.add(site.filePath);
  }

  const rows: OwnerRow[] = [];
  for (const [owner, groups] of byOwner) {
    const files = new Set<string>();
    let fallbackFiles = 0;
    let hasSiteDetail = false;
    let delta: number | undefined;
    for (const group of groups) {
      const set = filesByGroup.get(group.id);
      if (set) {
        hasSiteDetail = true;
        for (const f of set) files.add(f);
      }
      fallbackFiles += group.files;
      const d = deltaFor(points, group.id);
      if (d !== undefined) delta = (delta ?? 0) + d;
    }
    rows.push({
      owner,
      groups,
      sites: groups.reduce((sum, g) => sum + g.sites, 0),
      files: hasSiteDetail ? files.size : fallbackFiles,
      delta,
    });
  }
  rows.sort((a, b) => {
    if (a.owner === UNOWNED && b.owner !== UNOWNED) return 1;
    if (b.owner === UNOWNED && a.owner !== UNOWNED) return -1;
    return b.sites - a.sites || a.owner.localeCompare(b.owner);
  });
  return rows;
}

export function distinctFileCount(sites: readonly ImportSite[]): number {
  return new Set(sites.map((s) => s.filePath)).size;
}

export interface SiteFilter {
  text: string;
  packageName: string;
  importKind: SiteKind | '';
}

export function filterSites(sites: readonly ImportSite[], filter: SiteFilter): ImportSite[] {
  const needle = filter.text.trim().toLowerCase();
  return sites.filter(
    (site) =>
      (!filter.packageName || site.packageName === filter.packageName) &&
      (!filter.importKind || site.importKind === filter.importKind) &&
      (!needle ||
        site.filePath.toLowerCase().includes(needle) ||
        site.moduleSpecifier.toLowerCase().includes(needle)),
  );
}

export function sortedEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const numberFormatter = new Intl.NumberFormat();

export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : dateFormatter.format(t);
}

export function formatShortDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : shortDateFormatter.format(t);
}

export function formatNumber(n: number): string {
  return numberFormatter.format(n);
}

export function formatDelta(delta: number): string {
  if (delta === 0) return '±0';
  return delta > 0 ? `+${formatNumber(delta)}` : `\u2212${formatNumber(Math.abs(delta))}`;
}

export function describeDelta(delta: number): string {
  if (delta === 0) return 'no change since the previous report';
  return `${delta > 0 ? 'up' : 'down'} ${formatNumber(Math.abs(delta))} since the previous report`;
}

export function formatRevision(revision: BaselineRevision | undefined): string | undefined {
  if (!revision) return undefined;
  const parts: string[] = [];
  if (revision.commit) parts.push(revision.commit.slice(0, 7));
  if (revision.branch && revision.branch !== 'HEAD') parts.push(revision.branch);
  else if (revision.branch === 'HEAD' && !revision.commit) parts.push('HEAD');
  return parts.length ? parts.join(' on ') : undefined;
}
