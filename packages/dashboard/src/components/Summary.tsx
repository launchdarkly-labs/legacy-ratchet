import type { ReportSnapshot } from '@legacy-ratchet/core';

import { formatDate, formatNumber, formatRevision, SITES_HINT } from '../model';
import { Delta } from './bits';

export interface SummaryProps {
  snapshot: ReportSnapshot;
  totalDelta: number | undefined;
  fileCount: number;
}

export function Summary({ snapshot, totalDelta, fileCount }: SummaryProps) {
  const revision = formatRevision(snapshot.revision);
  return (
    <header className="summary">
      <div className="summary__title">
        <h1>Legacy dependency report</h1>
        <p className="muted">
          Generated <time dateTime={snapshot.generatedAt}>{formatDate(snapshot.generatedAt)}</time>
          {revision && (
            <>
              {' · '}
              <span title={snapshot.revision?.commit}>
                <code>{revision}</code>
              </span>
            </>
          )}
        </p>
      </div>
      <dl className="stats">
        <div className="stat stat--primary">
          <dt>Legacy sites</dt>
          <dd>
            <span className="stat__value" data-testid="total-sites">
              {formatNumber(snapshot.totalSites)}
            </span>
            <Delta value={totalDelta} />
          </dd>
          <dd className="stat__hint muted small">{SITES_HINT}</dd>
        </div>
        <div className="stat">
          <dt>Groups</dt>
          <dd>
            <span className="stat__value" data-testid="group-count">
              {formatNumber(snapshot.groups.length)}
            </span>
          </dd>
        </div>
        <div className="stat">
          <dt>Files</dt>
          <dd>
            <span className="stat__value">{formatNumber(fileCount)}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Snapshots</dt>
          <dd>
            <span className="stat__value">{formatNumber(snapshot.history.length)}</span>
            <span className="muted"> in history</span>
          </dd>
        </div>
      </dl>
    </header>
  );
}
