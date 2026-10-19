import type { BaselineRevision, ImportSite } from '@legacy-ratchet/core';

import { type DashboardGroup, directoryOf, ownerOf, type SeriesSnapshot, siteOwners } from './model';

export interface FileCount {
  filePath: string;
  count: number;
}

export type ProgressBasis = 'adoption' | 'complete';

export interface Progress {
  pct: number;
  basis: ProgressBasis;
}

export interface GroupProgress {
  start: number | null;
  completePct: number | null;
  newSites: number | null;
  adoptionPct: number | null;
  progress: Progress | null;
  byOwner: Record<string, number>;
  byDirectory: Record<string, number>;
  startHere: FileCount[];
  done: boolean;
}

export interface TotalsView {
  sites: number;
  start: number | null;
  completePct: number | null;
  newSites: number | null;
  adoptionPct: number | null;
  progress: Progress | null;
}

export const START_HERE_LIMIT = 10;

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function progressFrom(
  sites: number,
  adoptionPct: number | null,
  completePct: number | null,
  start: number | null,
): Progress | null {
  if (adoptionPct !== null) return { pct: clampPct(adoptionPct), basis: 'adoption' };
  if (completePct !== null && start !== null && start > sites) return { pct: clampPct(completePct), basis: 'complete' };
  return null;
}

function fileCounts(sites: readonly ImportSite[]): FileCount[] {
  const byFile = new Map<string, number>();
  for (const site of sites) byFile.set(site.filePath, (byFile.get(site.filePath) ?? 0) + 1);
  return [...byFile].map(([filePath, count]) => ({ filePath, count }));
}

export function progressOf(group: DashboardGroup, sites: readonly ImportSite[]): GroupProgress {
  const owner = ownerOf(group);

  let byOwner = group.byOwner;
  if (!byOwner) {
    byOwner = {};
    if (sites.length > 0) {
      for (const site of sites) for (const o of siteOwners(site, owner)) byOwner[o] = (byOwner[o] ?? 0) + 1;
    } else if (group.sites > 0) {
      byOwner[owner] = group.sites;
    }
  }

  let byDirectory = group.byDirectory;
  if (!byDirectory) {
    byDirectory = {};
    for (const site of sites) {
      const dir = directoryOf(site.filePath);
      byDirectory[dir] = (byDirectory[dir] ?? 0) + 1;
    }
  }

  const startHere =
    group.startHere ??
    fileCounts(sites)
      .sort((a, b) => a.count - b.count || a.filePath.localeCompare(b.filePath))
      .slice(0, START_HERE_LIMIT);

  const start = isNumber(group.start) ? group.start : null;
  const completePct = isNumber(group.completePct) ? group.completePct : null;
  const adoptionPct = isNumber(group.adoptionPct) ? group.adoptionPct : null;
  return {
    start,
    completePct,
    newSites: isNumber(group.newSites) ? group.newSites : null,
    adoptionPct,
    progress: progressFrom(group.sites, group.new.length > 0 ? adoptionPct : null, completePct, start),
    byOwner,
    byDirectory,
    startHere,
    done: group.sites === 0,
  };
}

export function totalsOf(snapshot: SeriesSnapshot): TotalsView {
  const totals = snapshot.totals;
  const sites = totals && isNumber(totals.sites) ? totals.sites : snapshot.totalSites;
  const groups = snapshot.groups;

  let start = totals && isNumber(totals.start) ? totals.start : null;
  let completePct = totals && isNumber(totals.completePct) ? totals.completePct : null;
  let newSites = totals && isNumber(totals.newSites) ? totals.newSites : null;
  let adoptionPct = totals && isNumber(totals.adoptionPct) ? totals.adoptionPct : null;

  if (!totals) {
    if (groups.length > 0 && groups.every((g) => isNumber(g.start))) {
      start = groups.reduce((sum, g) => sum + (g.start ?? 0), 0);
      completePct = start === 0 ? 100 : round1(clampPct(((start - sites) / start) * 100));
    }
    if (groups.length > 0 && groups.every((g) => isNumber(g.newSites))) {
      newSites = groups.reduce((sum, g) => sum + (g.newSites ?? 0), 0);
      adoptionPct = newSites + sites === 0 ? null : round1((newSites / (newSites + sites)) * 100);
    }
  }

  return { sites, start, completePct, newSites, adoptionPct, progress: progressFrom(sites, adoptionPct, completePct, start) };
}

export function sortGroupsForOverview<T extends { group: DashboardGroup; progress: GroupProgress }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.progress.done) - Number(b.progress.done) ||
      (a.progress.progress?.pct ?? 0) - (b.progress.progress?.pct ?? 0) ||
      b.group.sites - a.group.sites ||
      a.group.id.localeCompare(b.group.id),
  );
}

export const METRIC_HINT = {
  adoption: 'Share of imports that already use the replacement packages.',
  complete: 'Share of legacy imports removed since tracking started. This group has no replacement packages to count.',
  left: 'Import sites that still use the old packages, counted once per file and package.',
  onReplacements: 'Import sites that already use the replacement packages, counted once per file and package.',
  start: 'Legacy imports when tracking started, or the configured starting count.',
  startHere: 'Files with the fewest legacy imports in this group: quick wins to clear first.',
} as const;

export function progressHint(progress: Progress): string {
  return progress.basis === 'adoption' ? METRIC_HINT.adoption : METRIC_HINT.complete;
}

const percentFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function formatPct(value: number): string {
  return `${percentFormatter.format(round1(value))}%`;
}

export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function sourceUrl(
  template: string | undefined,
  revision: BaselineRevision | undefined,
  filePath: string,
  line?: number,
): string | undefined {
  if (!template) return undefined;
  let url = template;
  if (line === undefined) {
    const hash = url.indexOf('#');
    if (hash !== -1 && url.slice(hash).includes('{line}')) url = url.slice(0, hash);
  }
  url = url
    .split('{sha}')
    .join(encodeURIComponent(revision?.commit || 'HEAD'))
    .split('{path}')
    .join(encodePath(filePath))
    .split('{line}')
    .join(line === undefined ? '' : String(line));
  return safeHref(url);
}
