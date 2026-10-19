import { type MouseEvent, useCallback } from 'react';

import { type DashboardGroup, formatDate, formatNumber, ownerOf, type SeriesSnapshot } from '../model';
import { formatPct, type GroupProgress, METRIC_HINT, progressHint, type TotalsView } from '../progress';

import { ProgressBar } from './bits';

export interface OverviewRow {
  group: DashboardGroup;
  progress: GroupProgress;
}

export interface OverviewProps {
  snapshot: SeriesSnapshot;
  totals: TotalsView;
  rows: readonly OverviewRow[];
  focusGroupId?: string;
  onOpenGroup: (groupId: string) => void;
}

function Revision({ snapshot }: { snapshot: SeriesSnapshot }) {
  const commit = snapshot.revision?.commit;
  const branch = snapshot.revision?.branch;
  if (!commit && !branch) {
    return null;
  }
  return (
    <>
      {' · '}
      {commit ? (
        <span title={commit}>
          commit <code>{commit.slice(0, 7)}</code>
        </span>
      ) : null}
      {branch && branch !== 'HEAD' ? <span>{commit ? ` on ${branch}` : branch}</span> : null}
    </>
  );
}

function Headline({ totals }: { totals: TotalsView }) {
  const left = `${formatNumber(totals.sites)} legacy ${totals.sites === 1 ? 'import' : 'imports'} left`;
  return (
    <div className="headline">
      {totals.progress ? (
        <>
          <p className="headline__value" data-testid="headline" title={progressHint(totals.progress)}>
            <span className="headline__pct">{formatPct(totals.progress.pct)}</span> migrated
          </p>
          <ProgressBar
            value={totals.progress.pct}
            label="Migrated overall"
            title={progressHint(totals.progress)}
            size="large"
          />
          <p className="headline__sub" data-testid="headline-sub">
            <span title={METRIC_HINT.left}>{left}</span>
            {totals.newSites !== null && (
              <>
                {' · '}
                <span title={METRIC_HINT.onReplacements}>
                  {formatNumber(totals.newSites)} {totals.newSites === 1 ? 'import' : 'imports'} already on replacements
                </span>
              </>
            )}
          </p>
        </>
      ) : (
        <p className="headline__value" data-testid="headline" title={METRIC_HINT.left}>
          {left}
        </p>
      )}
    </div>
  );
}

function noProgressHint(group: DashboardGroup): string {
  return group.new.length === 0
    ? 'This group lists no replacement packages and has not shrunk since tracking started.'
    : 'Nothing has moved to the replacement packages yet.';
}

function GroupRow({
  row,
  autoFocus,
  onOpen,
}: {
  row: OverviewRow;
  autoFocus: boolean;
  onOpen: (groupId: string) => void;
}) {
  const { group, progress } = row;
  const open = useCallback(() => onOpen(group.id), [onOpen, group.id]);
  const onRowClick = useCallback(
    (event: MouseEvent<HTMLLIElement>) => {
      if (event.target instanceof Element && event.target.closest('button, a')) {
        return;
      }
      open();
    },
    [open],
  );
  const focusRef = useCallback(
    (el: HTMLButtonElement | null) => {
      if (!el || !autoFocus) {
        return;
      }
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: 'center' });
    },
    [autoFocus],
  );
  const pct = progress.progress;
  const descriptionId = `group-row-${group.id}-description`;

  return (
    <li className={`group-row${progress.done ? ' is-done' : ''}`} onClick={onRowClick} data-group-id={group.id}>
      <div className="group-row__name">
        <button
          type="button"
          className="group-row__open"
          ref={focusRef}
          onClick={open}
          aria-describedby={group.description ? descriptionId : undefined}
        >
          {group.id}
        </button>
        {group.description && (
          <span className="muted small group-row__description" id={descriptionId}>
            {group.description}
          </span>
        )}
      </div>
      <div className="group-row__progress">
        {pct ? (
          <>
            <ProgressBar value={pct.pct} label={`${group.id} migrated`} title={progressHint(pct)} />
            <span className="group-row__pct" title={progressHint(pct)}>
              {formatPct(pct.pct)}
              {pct.basis === 'complete' && <span className="muted small"> removed</span>}
            </span>
          </>
        ) : (
          <span className="muted small" title={noProgressHint(group)}>
            {group.new.length === 0 ? 'No replacement listed' : 'Not started'}
          </span>
        )}
      </div>
      <div className="group-row__left" title={METRIC_HINT.left}>
        {progress.done ? (
          <span className="done-label">Done</span>
        ) : (
          <>
            <span className="strong">{formatNumber(group.sites)}</span> left
          </>
        )}
      </div>
      <div className="group-row__owner muted small" title="Owner declared on the group">
        {ownerOf(group)}
      </div>
    </li>
  );
}

export function Overview({ snapshot, totals, rows, focusGroupId, onOpenGroup }: OverviewProps) {
  return (
    <>
      <header className="overview__header">
        <h1 className="overview__title">Migration tracker</h1>
        <p className="muted small" data-testid="generated">
          Generated <time dateTime={snapshot.generatedAt}>{formatDate(snapshot.generatedAt)}</time>
          <Revision snapshot={snapshot} />
        </p>
        <Headline totals={totals} />
      </header>
      <main>
        <section className="panel" aria-labelledby="groups-heading">
          <div className="panel__header">
            <h2 id="groups-heading">Groups</h2>
            <p className="muted small">Least migrated first. Select a group for teams, folders and files.</p>
          </div>
          {rows.length === 0 ? (
            <p className="muted">No groups are configured.</p>
          ) : (
            <ol className="group-rows">
              {rows.map((row) => (
                <GroupRow key={row.group.id} row={row} autoFocus={row.group.id === focusGroupId} onOpen={onOpenGroup} />
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}
