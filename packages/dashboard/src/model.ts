import type {
  BaselineRevision,
  GroupReport,
  ImportKind,
  ImportSite,
  ReportSnapshot,
  ReportTotals,
  SiteKind,
} from '@migration-tracker/core';

export type ProgressKey =
  | 'start'
  | 'completePct'
  | 'newSites'
  | 'adoptionPct'
  | 'byOwner'
  | 'byDirectory'
  | 'startHere';

type RemovedGroupKey = 'forecast' | 'target';

export type DashboardGroup = Omit<GroupReport, ProgressKey | RemovedGroupKey> & Partial<Pick<GroupReport, ProgressKey>>;

export type DashboardTotals = Pick<ReportTotals, 'sites'> &
  Partial<Pick<ReportTotals, 'start' | 'completePct' | 'newSites' | 'adoptionPct'>>;

export const SITES_HINT = 'import sites (one per file and package)';

export type SeriesSnapshot = Omit<ReportSnapshot, 'groups' | 'totals'> & {
  groups: DashboardGroup[];
  totals?: DashboardTotals;
  upgradedFrom?: 1;
};

export function siteKindOf(kind: ImportKind): SiteKind {
  return kind === 'require' || kind === 'import-equals' ? 'require' : 'import';
}

export const UNOWNED = 'Unowned';

export function ownerOf(group: Pick<DashboardGroup, 'owner'>): string {
  const owner = group.owner?.trim();
  return owner ? owner : UNOWNED;
}

export interface SiteFilter {
  text: string;
  packageName: string;
  importKind?: SiteKind | '';
  owner?: string;
  directory?: string;
}

export function siteOwners(site: Pick<ImportSite, 'owners'>, fallbackOwner: string = UNOWNED): string[] {
  const owners = site.owners?.filter((o) => typeof o === 'string' && o.trim() !== '');
  return owners && owners.length > 0 ? owners : [fallbackOwner];
}

export function directoryOf(filePath: string): string {
  const dirs = filePath.split('/').slice(0, -1).filter((s) => s !== '');
  return dirs.length === 0 ? '.' : dirs.slice(0, 2).join('/');
}

export function inDirectory(filePath: string, directory: string): boolean {
  if (directory === '.') return !filePath.includes('/');
  return filePath === directory || filePath.startsWith(`${directory}/`);
}

export function filterSites(
  sites: readonly ImportSite[],
  filter: SiteFilter,
  fallbackOwner: string = UNOWNED,
): ImportSite[] {
  const needle = filter.text.trim().toLowerCase();
  return sites.filter(
    (site) =>
      (!filter.packageName || site.packageName === filter.packageName) &&
      (!filter.importKind || site.importKind === filter.importKind) &&
      (!filter.owner || siteOwners(site, fallbackOwner).includes(filter.owner)) &&
      (!filter.directory || inDirectory(site.filePath, filter.directory)) &&
      (!needle ||
        site.filePath.toLowerCase().includes(needle) ||
        site.moduleSpecifier.toLowerCase().includes(needle)),
  );
}

export interface FileRow {
  filePath: string;
  count: number;
  owners: string[];
}

export function aggregateFiles(sites: readonly ImportSite[], fallbackOwner: string = UNOWNED): FileRow[] {
  const byFile = new Map<string, { count: number; owners: Set<string> }>();
  for (const site of sites) {
    let row = byFile.get(site.filePath);
    if (!row) byFile.set(site.filePath, (row = { count: 0, owners: new Set() }));
    row.count += 1;
    for (const owner of siteOwners(site, fallbackOwner)) row.owners.add(owner);
  }
  return [...byFile]
    .map(([filePath, row]) => ({ filePath, count: row.count, owners: [...row.owners].sort() }))
    .sort((a, b) => b.count - a.count || a.filePath.localeCompare(b.filePath));
}

export function sortedEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const numberFormatter = new Intl.NumberFormat();

export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : dateFormatter.format(t);
}

export function formatNumber(n: number): string {
  return numberFormatter.format(n);
}

export function formatRevision(revision: BaselineRevision | undefined): string | undefined {
  if (!revision) return undefined;
  const parts: string[] = [];
  if (revision.commit) parts.push(revision.commit.slice(0, 7));
  if (revision.branch && revision.branch !== 'HEAD') parts.push(revision.branch);
  else if (revision.branch === 'HEAD' && !revision.commit) parts.push('HEAD');
  return parts.length ? parts.join(' on ') : undefined;
}
