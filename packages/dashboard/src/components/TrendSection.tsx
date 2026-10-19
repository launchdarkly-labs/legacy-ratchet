import type { GroupReport } from '@legacy-ratchet/core';

import {
  formatDate,
  formatNumber,
  formatRevision,
  IDENTITY_CHANGE_NOTE,
  identityChangeAt,
  seriesFor,
  TOTAL_KEY,
  type TrendPoint,
} from '../model';
import { TrendChart } from './TrendChart';

export interface TrendSectionProps {
  groups: readonly GroupReport[];
  points: readonly TrendPoint[];
}

export function TrendSection({ groups, points }: TrendSectionProps) {
  const total = seriesFor(points, TOTAL_KEY);
  const changeAt = identityChangeAt(points);
  const changeIndex = changeAt === undefined ? -1 : points.findIndex((p) => p.generatedAt === changeAt);
  return (
    <section className="panel" aria-labelledby="trend-heading">
      <div className="panel__header">
        <h2 id="trend-heading">Trend</h2>
        <p className="muted">
          {points.length <= 1
            ? 'Only the current report is available. Run legacy report with --append-history to build a trend.'
            : `Total import sites (one per file and package) across ${points.length} snapshots, including this report.`}
        </p>
      </div>
      <div className="trend-full">
        <TrendChart label="All groups" values={total} variant="full" identityChangeAt={changeAt} />
      </div>
      {changeAt !== undefined && (
        <p className="muted small trend-note" aria-hidden="true">
          <span className="trend-note__swatch" />
          Counting changed on {formatDate(changeAt)}: one site per file and package from then on.
        </p>
      )}
      {groups.length > 0 && (
        <ul className="small-multiples">
          {groups.map((group) => {
            const values = seriesFor(points, group.id);
            return (
              <li key={group.id}>
                <span className="small-multiples__label">{group.id}</span>
                <TrendChart label={`${group.id} trend`} values={values} identityChangeAt={changeAt} />
                <span className="num strong">{formatNumber(group.sites)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <table className="visually-hidden">
        <caption>Legacy sites per snapshot</caption>
        <thead>
          <tr>
            <th scope="col">Snapshot</th>
            {groups.map((g) => (
              <th scope="col" key={g.id}>
                {g.id}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, i) => {
            const revision = formatRevision(point.revision);
            return (
              <tr key={`${point.generatedAt}-${i}`}>
                <th scope="row">
                  {formatDate(point.generatedAt)}
                  {revision ? ` (${revision})` : ''}
                  {point.current ? ' (this report)' : ''}
                  {i === changeIndex ? `. ${IDENTITY_CHANGE_NOTE}.` : ''}
                </th>
                {groups.map((g) => (
                  <td key={g.id}>{point.totals[g.id] ?? '—'}</td>
                ))}
                <td>{point.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
