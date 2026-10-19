import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import type { ImportSite } from '@legacy-ratchet/core';

import { aggregateFiles, type DashboardGroup, filterSites, formatNumber, ownerOf, sortedEntries } from '../model';
import { formatPct, type GroupProgress, METRIC_HINT, progressHint, safeHref } from '../progress';

import { ExternalLink, Migration, ModeBadge, ProgressBar, ShareBar } from './bits';

export const MAX_ROWS = 500;
const BAR_LIST_LIMIT = 8;

export interface FileFilters {
  text: string;
  owner: string;
  directory: string;
  packageName: string;
}

export const EMPTY_FILTERS: FileFilters = { text: '', owner: '', directory: '', packageName: '' };

export interface GroupViewProps {
  group: DashboardGroup;
  progress: GroupProgress;
  sites: readonly ImportSite[];
  filters: FileFilters;
  onFiltersChange: (filters: FileFilters) => void;
  onBack: () => void;
  onOpenFile: (filePath: string) => void;
}

type FilterKey = keyof FileFilters;

interface BarListProps {
  title: string;
  hint: string;
  entries: Array<[string, number]>;
  selected: string;
  onSelect: (key: string) => void;
  code?: boolean;
}

function BarList({ title, hint, entries, selected, onSelect, code = false }: BarListProps) {
  const [expanded, setExpanded] = useState(false);
  const max = entries[0]?.[1] ?? 0;
  const visible = expanded ? entries : entries.slice(0, BAR_LIST_LIMIT);
  return (
    <div className="bar-list">
      <h3 title={hint}>{title}</h3>
      {entries.length === 0 ? (
        <p className="muted small">Nothing left.</p>
      ) : (
        <ul>
          {visible.map(([key, count]) => {
            const pressed = key === selected;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`bar-list__item${pressed ? ' is-selected' : ''}`}
                  aria-pressed={pressed}
                  title={pressed ? 'Show all files again' : `Show only files for ${key}`}
                  onClick={() => onSelect(pressed ? '' : key)}
                >
                  <span className="bar-list__label">{code ? <code>{key}</code> : key}</span>
                  <ShareBar value={count} max={max} label={`${formatNumber(count)} legacy imports`} />
                  <span className="bar-list__count">{formatNumber(count)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {entries.length > BAR_LIST_LIMIT && (
        <button type="button" className="link-button small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer' : `Show all ${formatNumber(entries.length)}`}
        </button>
      )}
    </div>
  );
}

export function GroupView({
  group,
  progress,
  sites,
  filters,
  onFiltersChange,
  onBack,
  onOpenFile,
}: GroupViewProps) {
  const text = filters.text;
  const deferredText = useDeferredValue(text);
  const fallbackOwner = ownerOf(group);

  const setFilter = useCallback(
    (key: FilterKey, value: string) => onFiltersChange({ ...filters, [key]: value }),
    [filters, onFiltersChange],
  );

  const byOwner = useMemo(() => sortedEntries(progress.byOwner), [progress.byOwner]);
  const byDirectory = useMemo(() => sortedEntries(progress.byDirectory), [progress.byDirectory]);
  const byPackage = useMemo(() => sortedEntries(group.byPackage), [group.byPackage]);

  const options = useMemo(() => {
    const owners = new Set(Object.keys(progress.byOwner));
    const directories = new Set(Object.keys(progress.byDirectory));
    const packages = new Set(Object.keys(group.byPackage));
    for (const site of sites) {
      packages.add(site.packageName);
    }
    return {
      owner: [...owners].sort(),
      directory: [...directories].sort(),
      packageName: [...packages].sort(),
    };
  }, [progress.byOwner, progress.byDirectory, group.byPackage, sites]);

  const filtered = useMemo(
    () =>
      filterSites(
        sites,
        { text: deferredText, owner: filters.owner, directory: filters.directory, packageName: filters.packageName },
        fallbackOwner,
      ),
    [sites, deferredText, filters.owner, filters.directory, filters.packageName, fallbackOwner],
  );
  const files = useMemo(() => aggregateFiles(filtered, fallbackOwner), [filtered, fallbackOwner]);
  const totalFiles = useMemo(() => new Set(sites.map((s) => s.filePath)).size, [sites]);
  const visible = files.length > MAX_ROWS ? files.slice(0, MAX_ROWS) : files;
  const isFiltered = Boolean(text.trim() || filters.owner || filters.directory || filters.packageName);
  const knownFiles = useMemo(() => new Set(sites.map((s) => s.filePath)), [sites]);

  const focusOnMount = useCallback((el: HTMLHeadingElement | null) => {
    if (!el) {
      return;
    }
    el.focus({ preventScroll: true });
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, []);

  const pct = progress.progress;
  const docs = safeHref(group.docs);
  const headingId = `group-${group.id}`;

  return (
    <main className="view" aria-labelledby={headingId}>
      <nav className="crumbs" aria-label="Breadcrumb">
        <button type="button" className="button button--back" onClick={onBack}>
          <span aria-hidden="true">← </span>All groups
        </button>
        <span className="crumbs__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">{group.id}</span>
      </nav>

      <header className="panel view__header">
        <div className="view__title">
          <h2 id={headingId} tabIndex={-1} ref={focusOnMount}>
            {group.id} <ModeBadge mode={group.mode} />
          </h2>
          {group.description && <p>{group.description}</p>}
          <p className="muted small">
            <Migration from={group.old} to={group.new} />
            {' · '}
            {fallbackOwner}
            {docs && (
              <>
                {' · '}
                <ExternalLink href={docs}>Migration guide</ExternalLink>
              </>
            )}
          </p>
        </div>
        <div className="view__progress">
          {pct && (
            <>
              <p className="view__pct" title={progressHint(pct)} data-testid="group-pct">
                <span className="headline__pct">{formatPct(pct.pct)}</span>{' '}
                {pct.basis === 'adoption' ? 'migrated' : 'removed'}
              </p>
              <ProgressBar value={pct.pct} label={`${group.id} migrated`} title={progressHint(pct)} size="large" />
            </>
          )}
          <p className="view__counts" data-testid="group-counts">
            <span title={METRIC_HINT.left}>{formatNumber(group.sites)} left</span>
            {progress.newSites !== null && group.new.length > 0 && (
              <>
                {' · '}
                <span title={METRIC_HINT.onReplacements}>{formatNumber(progress.newSites)} on replacements</span>
              </>
            )}
            {progress.start !== null && progress.start > group.sites && (
              <>
                {' · '}
                <span title={METRIC_HINT.start}>started at {formatNumber(progress.start)}</span>
              </>
            )}
          </p>
        </div>
      </header>

      {group.sites > 0 && (
        <section className="panel" aria-labelledby="breakdown-heading">
          <div className="panel__header">
            <h2 id="breakdown-heading">Where the legacy imports are</h2>
            <p className="muted small">Select a bar to filter the file list.</p>
          </div>
          <div className="breakdowns">
            <BarList
              title="By team"
              hint="Legacy imports per code owner. Files without a code owner count under the group owner."
              entries={byOwner}
              selected={filters.owner}
              onSelect={(v) => setFilter('owner', v)}
            />
            <BarList
              title="By directory"
              hint="Legacy imports per top-level directory (first two path segments)."
              entries={byDirectory}
              selected={filters.directory}
              onSelect={(v) => setFilter('directory', v)}
              code
            />
            <BarList
              title="By package"
              hint="Legacy imports per old package."
              entries={byPackage}
              selected={filters.packageName}
              onSelect={(v) => setFilter('packageName', v)}
              code
            />
          </div>
        </section>
      )}

      {progress.startHere.length > 0 && (
        <section className="panel" aria-labelledby="start-here-heading">
          <div className="panel__header">
            <h2 id="start-here-heading">Start here</h2>
            <p className="muted small">{METRIC_HINT.startHere}</p>
          </div>
          <ol className="start-here">
            {progress.startHere.map((f) => (
              <li key={f.filePath}>
                {knownFiles.has(f.filePath) ? (
                  <button type="button" className="link-button path" onClick={() => onOpenFile(f.filePath)}>
                    {f.filePath}
                  </button>
                ) : (
                  <span className="path">{f.filePath}</span>
                )}
                <span className="muted small">
                  {formatNumber(f.count)} {f.count === 1 ? 'import' : 'imports'}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="panel" aria-labelledby="files-heading">
        <div className="panel__header">
          <h2 id="files-heading">Files</h2>
          <p className="muted small">Select a file to see each import and a link to the source.</p>
        </div>
        {sites.length > 0 && (
          <>
            <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
              <label>
                <span>Filter</span>
                <input
                  type="search"
                  value={text}
                  placeholder="File path or specifier"
                  onChange={(e) => setFilter('text', e.target.value)}
                />
              </label>
              <label>
                <span>Team</span>
                <select value={filters.owner} onChange={(e) => setFilter('owner', e.target.value)}>
                  <option value="">All teams</option>
                  {options.owner.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Directory</span>
                <select value={filters.directory} onChange={(e) => setFilter('directory', e.target.value)}>
                  <option value="">All directories</option>
                  {options.directory.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Package</span>
                <select value={filters.packageName} onChange={(e) => setFilter('packageName', e.target.value)}>
                  <option value="">All packages</option>
                  {options.packageName.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              {isFiltered && (
                <button
                  type="button"
                  className="button"
                  onClick={() => onFiltersChange(EMPTY_FILTERS)}
                >
                  Clear
                </button>
              )}
            </form>
            <p className="muted small" role="status" data-testid="file-count">
              Showing {formatNumber(visible.length)} of {formatNumber(files.length)}
              {isFiltered ? ` matching files (${formatNumber(totalFiles)} total)` : ' files'}
              {files.length > MAX_ROWS ? '. Narrow the filter to see the rest.' : ''}
            </p>
          </>
        )}
        {visible.length === 0 ? (
          <p className="muted">
            {sites.length === 0
              ? group.sites === 0
                ? 'No legacy imports left in this group.'
                : 'This report has no per-file detail for this group.'
              : 'No files match the filter.'}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="table compact" aria-label={`Files in ${group.id}`}>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col" className="num" title={METRIC_HINT.left}>
                    Legacy imports
                  </th>
                  <th scope="col">Team</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((file) => (
                  <tr key={file.filePath}>
                    <th scope="row">
                      <button type="button" className="link-button path" onClick={() => onOpenFile(file.filePath)}>
                        {file.filePath}
                      </button>
                    </th>
                    <td className="num">{formatNumber(file.count)}</td>
                    <td className="muted small">{file.owners.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
