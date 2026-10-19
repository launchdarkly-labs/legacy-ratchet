import type { GroupReport, ImportKind, ImportSite, SiteKind } from '@legacy-ratchet/core';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';

import { filterSites, formatNumber, sortedEntries } from '../model';
import { Migration, ModeBadge, ShareBar } from './bits';

export const MAX_ROWS = 500;

export const KIND_LABEL: Record<SiteKind, string> = {
  import: 'ES import',
  require: 'require',
};

export const SYNTAX_LABEL: Record<ImportKind, string> = {
  import: 'import',
  'dynamic-import': 'import()',
  'export-from': 'export from',
  require: 'require()',
  'import-equals': 'import =',
};

const SYNTAX_ORDER = Object.keys(SYNTAX_LABEL) as ImportKind[];

export function showsKindChips(site: Pick<ImportSite, 'importKind' | 'kinds'>): boolean {
  return !(site.kinds.length === 1 && site.kinds[0] === site.importKind);
}

function KindCell({ site }: { site: ImportSite }) {
  const kinds = SYNTAX_ORDER.filter((k) => site.kinds.includes(k));
  return (
    <>
      {KIND_LABEL[site.importKind] ?? site.importKind}
      {showsKindChips(site) && (
        <span className="chips">
          <span className="visually-hidden">, written as </span>
          {kinds.map((k) => (
            <span key={k} className="chip">
              {SYNTAX_LABEL[k]}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

export interface GroupDetailProps {
  group: GroupReport;
  sites: readonly ImportSite[];
  onClose: () => void;
}

export function GroupDetail({ group, sites, onClose }: GroupDetailProps) {
  const [text, setText] = useState('');
  const [packageName, setPackageName] = useState('');
  const [importKind, setImportKind] = useState<SiteKind | ''>('');
  const deferredText = useDeferredValue(text);

  const packages = useMemo(() => {
    const names = new Set(Object.keys(group.byPackage));
    for (const s of sites) names.add(s.packageName);
    return [...names].sort();
  }, [group.byPackage, sites]);

  const kinds = useMemo(() => {
    const present = new Set<SiteKind>(sites.map((s) => s.importKind));
    return (Object.keys(KIND_LABEL) as SiteKind[]).filter((k) => present.has(k));
  }, [sites]);

  const filtered = useMemo(
    () => filterSites(sites, { text: deferredText, packageName, importKind }),
    [sites, deferredText, packageName, importKind],
  );
  const visible = filtered.length > MAX_ROWS ? filtered.slice(0, MAX_ROWS) : filtered;
  const isFiltered = Boolean(text.trim() || packageName || importKind);
  const byPackage = useMemo(() => sortedEntries(group.byPackage), [group.byPackage]);
  const maxPackage = byPackage[0]?.[1] ?? 0;
  const maxFile = group.topFiles[0]?.count ?? 0;

  const focusOnMount = useCallback((el: HTMLHeadingElement | null) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, []);

  const headingId = `detail-${group.id}`;

  return (
    <section className="panel detail" aria-labelledby={headingId}>
      <div className="panel__header detail__header">
        <div>
          <h2 id={headingId} tabIndex={-1} ref={focusOnMount}>
            {group.id} <ModeBadge mode={group.mode} />
          </h2>
          {group.description && <p>{group.description}</p>}
          <p className="muted">
            <Migration from={group.old} to={group.new} />
            {' · '}
            {group.owner ?? 'Unowned'}
            {group.docs && (
              <>
                {' · '}
                <a href={group.docs} target="_blank" rel="noreferrer noopener">
                  Migration guide
                </a>
              </>
            )}
          </p>
        </div>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="detail__grid">
        <div>
          <h3>By package</h3>
          {byPackage.length === 0 ? (
            <p className="muted">No sites.</p>
          ) : (
            <table className="table compact">
              <caption className="visually-hidden">Sites by package in {group.id}</caption>
              <thead>
                <tr>
                  <th scope="col">Package</th>
                  <th scope="col" className="num">
                    Sites
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Share</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {byPackage.map(([name, count]) => (
                  <tr key={name}>
                    <th scope="row">
                      <code>{name}</code>
                    </th>
                    <td className="num">{formatNumber(count)}</td>
                    <td className="share">
                      <ShareBar value={count} max={maxPackage} label={`${count} sites`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3>Top files</h3>
          {group.topFiles.length === 0 ? (
            <p className="muted">No files.</p>
          ) : (
            <table className="table compact">
              <caption className="visually-hidden">Files with the most sites in {group.id}</caption>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col" className="num">
                    Sites
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Share</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.topFiles.map((f) => (
                  <tr key={f.filePath}>
                    <th scope="row" className="path">
                      <button type="button" className="link-button path" onClick={() => setText(f.filePath)}>
                        {f.filePath}
                      </button>
                    </th>
                    <td className="num">{formatNumber(f.count)}</td>
                    <td className="share">
                      <ShareBar value={f.count} max={maxFile} label={`${f.count} sites`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h3>Import sites</h3>
      <p className="muted small">One row per file and package. ES imports and require calls are counted separately.</p>
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>
          <span>Filter</span>
          <input
            type="search"
            value={text}
            placeholder="File path or specifier"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          <span>Package</span>
          <select value={packageName} onChange={(e) => setPackageName(e.target.value)}>
            <option value="">All packages</option>
            {packages.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Kind</span>
          <select value={importKind} onChange={(e) => setImportKind(e.target.value as SiteKind | '')}>
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        {isFiltered && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setText('');
              setPackageName('');
              setImportKind('');
            }}
          >
            Clear
          </button>
        )}
      </form>
      <p className="muted small" role="status" data-testid="site-count">
        Showing {formatNumber(visible.length)} of {formatNumber(filtered.length)}
        {isFiltered ? ` matching sites (${formatNumber(sites.length)} total)` : ' sites'}
        {filtered.length > MAX_ROWS ? '. Narrow the filter to see the rest.' : ''}
      </p>
      {visible.length === 0 ? (
        <p className="muted">{sites.length === 0 ? 'This group has no import sites.' : 'No sites match the filter.'}</p>
      ) : (
        <div className="table-scroll">
          <table className="table compact sites-table" aria-label={`Import sites in ${group.id}`}>
            <thead>
              <tr>
                <th scope="col">Location</th>
                <th scope="col">Specifier</th>
                <th scope="col">Kind</th>
                <th scope="col">Type-only</th>
                <th scope="col">Suppression</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((site) => (
                <tr key={site.id}>
                  <td className="path">
                    {site.filePath}
                    {site.line !== undefined && <span className="muted">:{site.line}</span>}
                    {site.occurrences !== undefined && site.occurrences > 1 && (
                      <span className="muted occurrences" title={`${site.occurrences} imports of this specifier in the file`}>
                        <span aria-hidden="true">{`\u00d7${site.occurrences}`}</span>
                        <span className="visually-hidden">{`, ${site.occurrences} imports in this file`}</span>
                      </span>
                    )}
                  </td>
                  <td>
                    <code>{site.moduleSpecifier}</code>
                  </td>
                  <td>
                    <KindCell site={site} />
                  </td>
                  <td>{site.typeOnly ? 'type-only' : <span className="muted">—</span>}</td>
                  <td>
                    {site.suppression ? (
                      !site.suppression.reason ? (
                        <span className="warning" title="Suppressions without a reason are not honored">
                          missing reason
                        </span>
                      ) : site.suppression.groupIds.length > 0 && !site.suppression.groupIds.includes(site.groupId) ? (
                        <span className="warning" title="This suppression names other groups, so it does not apply here">
                          {site.suppression.reason} (other groups)
                        </span>
                      ) : (
                        <span className="suppressed">{site.suppression.reason}</span>
                      )
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
