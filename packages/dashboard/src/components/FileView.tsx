import { useCallback, useMemo } from 'react';
import type { BaselineRevision, ImportKind, ImportSite, SiteKind } from '@legacy-ratchet/core';

import { type DashboardGroup, formatNumber, ownerOf, siteOwners } from '../model';
import { safeHref, sourceUrl } from '../progress';

import { ExternalLink, PackageList } from './bits';

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
      {site.typeOnly && (
        <span className="chips">
          <span className="chip" title="Only types are imported">
            type-only
          </span>
        </span>
      )}
    </>
  );
}

function SuppressionCell({ site }: { site: ImportSite }) {
  const s = site.suppression;
  if (!s) {
    return <span className="muted">—</span>;
  }
  if (!s.reason) {
    return (
      <span className="warning" title="Suppressions without a reason are not honored">
        missing reason
      </span>
    );
  }
  if (s.groupIds.length > 0 && !s.groupIds.includes(site.groupId)) {
    return (
      <span className="warning" title="This suppression names other groups, so it does not apply here">
        {s.reason} (other groups)
      </span>
    );
  }
  return <span className="suppressed">{s.reason}</span>;
}

export interface FileViewProps {
  group: DashboardGroup;
  filePath: string;
  sites: readonly ImportSite[];
  sourceUrlTemplate?: string;
  revision?: BaselineRevision;
  onBackToGroup: () => void;
  onBackToOverview: () => void;
}

export function FileView({
  group,
  filePath,
  sites,
  sourceUrlTemplate,
  revision,
  onBackToGroup,
  onBackToOverview,
}: FileViewProps) {
  const fallbackOwner = ownerOf(group);
  const ordered = useMemo(
    () =>
      [...sites].sort(
        (a, b) =>
          (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
          a.moduleSpecifier.localeCompare(b.moduleSpecifier),
      ),
    [sites],
  );
  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const site of sites) {
      for (const o of siteOwners(site, fallbackOwner)) set.add(o);
    }
    return [...set].sort();
  }, [sites, fallbackOwner]);
  const fileLink = sourceUrl(sourceUrlTemplate, revision, filePath);
  const docs = safeHref(group.docs);

  const focusOnMount = useCallback((el: HTMLHeadingElement | null) => {
    if (!el) {
      return;
    }
    el.focus({ preventScroll: true });
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, []);

  return (
    <main className="view" aria-labelledby="file-heading">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button type="button" className="button button--back" onClick={onBackToGroup}>
          <span aria-hidden="true">← </span>Back to {group.id}
        </button>
        <button type="button" className="link-button crumbs__link" onClick={onBackToOverview}>
          All groups
        </button>
        <span className="crumbs__sep" aria-hidden="true">
          /
        </span>
        <button type="button" className="link-button crumbs__link" onClick={onBackToGroup}>
          {group.id}
        </button>
        <span className="crumbs__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page" className="path">
          {filePath.split('/').pop()}
        </span>
      </nav>

      <header className="panel view__header">
        <div className="view__title">
          <h2 id="file-heading" className="path view__file" tabIndex={-1} ref={focusOnMount}>
            {filePath}
          </h2>
          <p className="muted small">
            {formatNumber(sites.length)} legacy {sites.length === 1 ? 'import' : 'imports'} from {group.id}
            {' · '}
            {owners.join(', ') || fallbackOwner}
            {fileLink && (
              <>
                {' · '}
                <ExternalLink href={fileLink}>View file on source</ExternalLink>
              </>
            )}
          </p>
          <p className="replace-with" data-testid="replace-with">
            Replace with: <PackageList packages={group.new} empty="no replacement listed" />
            {docs && (
              <>
                {' — '}
                <ExternalLink href={docs}>migration guide</ExternalLink>
              </>
            )}
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="imports-heading">
        <div className="panel__header">
          <h2 id="imports-heading">Imports</h2>
          <p className="muted small">One row per package and module system in this file.</p>
        </div>
        {ordered.length === 0 ? (
          <p className="muted">No legacy imports from {group.id} in this file.</p>
        ) : (
          <div className="table-scroll">
            <table className="table compact" aria-label={`Legacy imports in ${filePath}`}>
              <thead>
                <tr>
                  <th scope="col" className="num">
                    Line
                  </th>
                  <th scope="col">Specifier</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Team</th>
                  <th scope="col">Suppression</th>
                  <th scope="col">
                    <span className="visually-hidden">Source</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((site) => {
                  const href = sourceUrl(sourceUrlTemplate, revision, site.filePath, site.line);
                  return (
                    <tr key={site.id}>
                      <td className="num">
                        {site.line ?? <span className="muted">—</span>}
                        {site.occurrences !== undefined && site.occurrences > 1 && (
                          <span
                            className="muted occurrences"
                            title={`${site.occurrences} imports of this specifier in the file`}
                          >
                            <span aria-hidden="true">{`×${site.occurrences}`}</span>
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
                      <td className="muted small">{siteOwners(site, fallbackOwner).join(', ')}</td>
                      <td>
                        <SuppressionCell site={site} />
                      </td>
                      <td>
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`View ${site.moduleSpecifier} on source${site.line !== undefined ? `, line ${site.line}` : ''}`}
                          >
                            View on source
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
