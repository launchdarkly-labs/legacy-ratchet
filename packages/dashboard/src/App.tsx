import type { ReportSnapshot } from '@legacy-ratchet/core';
import { useCallback, useMemo, useState } from 'react';

import { EmptyState } from './components/EmptyState';
import { GroupDetail } from './components/GroupDetail';
import { GroupTable } from './components/GroupTable';
import { OwnershipTable } from './components/OwnershipTable';
import { Summary } from './components/Summary';
import { TrendSection } from './components/TrendSection';
import type { LoadState } from './data';
import { aggregateOwners, buildSeries, deltaFor, distinctFileCount, type SeriesSnapshot, TOTAL_KEY } from './model';

export function App({ state }: { state: LoadState }) {
  if (state.status === 'missing') return <EmptyState />;
  if (state.status === 'invalid') return <EmptyState message={state.message} />;
  return <Dashboard snapshot={state.snapshot} sample={state.sample ?? false} />;
}

function groupFromHash(groups: ReportSnapshot['groups']): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const match = /^#group=(.+)$/.exec(window.location.hash);
  if (!match?.[1]) return undefined;
  const id = decodeURIComponent(match[1]);
  return groups.some((g) => g.id === id) ? id : undefined;
}

function writeHash(id: string | undefined) {
  if (typeof window === 'undefined') return;
  const url = `${window.location.pathname}${window.location.search}${id ? `#group=${encodeURIComponent(id)}` : ''}`;
  try {
    window.history.replaceState(null, '', url);
  } catch {
    return;
  }
}

export function Dashboard({ snapshot, sample = false }: { snapshot: SeriesSnapshot; sample?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | undefined>(() => groupFromHash(snapshot.groups));

  const points = useMemo(() => buildSeries(snapshot), [snapshot]);
  const owners = useMemo(() => aggregateOwners(snapshot, points), [snapshot, points]);
  const fileCount = useMemo(
    () =>
      snapshot.sites.length > 0
        ? distinctFileCount(snapshot.sites)
        : snapshot.groups.reduce((sum, g) => sum + g.files, 0),
    [snapshot],
  );
  const sitesByGroup = useMemo(() => {
    const map = new Map<string, ReportSnapshot['sites']>();
    for (const site of snapshot.sites) {
      const list = map.get(site.groupId);
      if (list) list.push(site);
      else map.set(site.groupId, [site]);
    }
    return map;
  }, [snapshot.sites]);

  const selected = selectedId ? snapshot.groups.find((g) => g.id === selectedId) : undefined;
  const select = useCallback((id: string | undefined) => {
    setSelectedId(id);
    writeHash(id);
  }, []);
  const toggle = useCallback((id: string) => select(id === selectedId ? undefined : id), [select, selectedId]);
  const open = useCallback((id: string) => select(id), [select]);
  const close = useCallback(() => select(undefined), [select]);

  return (
    <div className="app">
      {sample && (
        <p className="banner" role="note">
          Showing sample data (development mode). Run <code>legacy report --format html</code> to see a real report.
        </p>
      )}
      <Summary snapshot={snapshot} totalDelta={deltaFor(points, TOTAL_KEY)} fileCount={fileCount} />
      <main className="layout">
        <GroupTable groups={snapshot.groups} points={points} selectedId={selectedId} onSelect={toggle} />
        {selected && (
          <GroupDetail
            key={selected.id}
            group={selected}
            sites={sitesByGroup.get(selected.id) ?? []}
            onClose={close}
          />
        )}
        <div className="layout__row">
          <TrendSection groups={snapshot.groups} points={points} />
          <OwnershipTable rows={owners} totalSites={snapshot.totalSites} onSelectGroup={open} />
        </div>
      </main>
    </div>
  );
}
