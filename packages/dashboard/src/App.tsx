import type { ImportSite } from '@legacy-ratchet/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { EmptyState } from './components/EmptyState';
import { FileView } from './components/FileView';
import { EMPTY_FILTERS, type FileFilters, GroupView } from './components/GroupView';
import { Overview, type OverviewRow } from './components/Overview';
import type { LoadState } from './data';
import type { SeriesSnapshot } from './model';
import { progressOf, sortGroupsForOverview, totalsOf } from './progress';
import { formatHash, parseHash, type View } from './route';

export function App({ state }: { state: LoadState }) {
  if (state.status === 'missing') return <EmptyState />;
  if (state.status === 'invalid') return <EmptyState message={state.message} />;
  return <Dashboard snapshot={state.snapshot} sample={state.sample ?? false} />;
}

function currentHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

function writeHash(view: View) {
  if (typeof window === 'undefined') return;
  const hash = formatHash(view);
  if (hash === window.location.hash) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  try {
    window.history.pushState(null, '', url);
  } catch {
    return;
  }
}

export function Dashboard({ snapshot, sample = false }: { snapshot: SeriesSnapshot; sample?: boolean }) {
  const sitesByGroup = useMemo(() => {
    const map = new Map<string, ImportSite[]>();
    for (const site of snapshot.sites) {
      const list = map.get(site.groupId);
      if (list) list.push(site);
      else map.set(site.groupId, [site]);
    }
    return map;
  }, [snapshot.sites]);

  const rows = useMemo<OverviewRow[]>(
    () =>
      sortGroupsForOverview(
        snapshot.groups.map((group) => ({ group, progress: progressOf(group, sitesByGroup.get(group.id) ?? []) })),
      ),
    [snapshot.groups, sitesByGroup],
  );
  const totals = useMemo(() => totalsOf(snapshot), [snapshot]);

  const resolve = useCallback(
    (requested: View): View => {
      if (!requested.groupId || !snapshot.groups.some((g) => g.id === requested.groupId)) return {};
      const sites = sitesByGroup.get(requested.groupId) ?? [];
      if (requested.file && sites.some((s) => s.filePath === requested.file)) {
        return { groupId: requested.groupId, file: requested.file };
      }
      return { groupId: requested.groupId };
    },
    [snapshot.groups, sitesByGroup],
  );

  const [view, setView] = useState<View>(() => resolve(parseHash(currentHash())));
  const [returnTo, setReturnTo] = useState<string | undefined>(undefined);
  const [filtersByGroup, setFiltersByGroup] = useState<Record<string, FileFilters>>({});

  useEffect(() => {
    const sync = () => setView(resolve(parseHash(currentHash())));
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [resolve]);

  const navigate = useCallback(
    (next: View) => {
      setReturnTo(view.groupId && !next.groupId ? view.groupId : undefined);
      setView(next);
      writeHash(next);
    },
    [view.groupId],
  );

  const row = view.groupId ? rows.find((r) => r.group.id === view.groupId) : undefined;
  const groupSites = row ? (sitesByGroup.get(row.group.id) ?? []) : [];

  let content;
  if (row && view.file) {
    const file = view.file;
    content = (
      <FileView
        key={`${row.group.id}:${file}`}
        group={row.group}
        filePath={file}
        sites={groupSites.filter((s) => s.filePath === file)}
        sourceUrlTemplate={snapshot.sourceUrlTemplate}
        revision={snapshot.revision}
        onBackToGroup={() => navigate({ groupId: row.group.id })}
        onBackToOverview={() => navigate({})}
      />
    );
  } else if (row) {
    content = (
      <GroupView
        key={row.group.id}
        group={row.group}
        progress={row.progress}
        sites={groupSites}
        filters={filtersByGroup[row.group.id] ?? EMPTY_FILTERS}
        onFiltersChange={(filters) => setFiltersByGroup((current) => ({ ...current, [row.group.id]: filters }))}
        onBack={() => navigate({})}
        onOpenFile={(file) => navigate({ groupId: row.group.id, file })}
      />
    );
  } else {
    content = (
      <Overview
        snapshot={snapshot}
        totals={totals}
        rows={rows}
        focusGroupId={returnTo}
        onOpenGroup={(groupId) => navigate({ groupId })}
      />
    );
  }

  return (
    <div className="app">
      {sample && (
        <p className="banner" role="note">
          Showing sample data (development mode). Run <code>legacy report --format html</code> to see a real report.
        </p>
      )}
      {content}
    </div>
  );
}
