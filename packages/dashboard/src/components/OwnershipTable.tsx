import { formatNumber, type OwnerRow } from '../model';
import { Delta, ShareBar } from './bits';

export interface OwnershipTableProps {
  rows: readonly OwnerRow[];
  totalSites: number;
  onSelectGroup: (groupId: string) => void;
}

export function OwnershipTable({ rows, totalSites, onSelectGroup }: OwnershipTableProps) {
  return (
    <section className="panel" aria-labelledby="ownership-heading">
      <div className="panel__header">
        <h2 id="ownership-heading">Ownership</h2>
        <p className="muted">Legacy sites by the owner declared on each group.</p>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No groups are configured.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Owner</th>
                <th scope="col">Groups</th>
                <th scope="col" className="num">
                  Sites
                </th>
                <th scope="col" className="num">
                  Files
                </th>
                <th scope="col" className="num">
                  Change
                </th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pct = totalSites > 0 ? Math.round((row.sites / totalSites) * 100) : 0;
                return (
                  <tr key={row.owner}>
                    <th scope="row">{row.owner}</th>
                    <td>
                      {row.groups.map((g, i) => (
                        <span key={g.id}>
                          {i > 0 && ', '}
                          <button type="button" className="link-button" onClick={() => onSelectGroup(g.id)}>
                            {g.id}
                          </button>
                        </span>
                      ))}
                    </td>
                    <td className="num strong">{formatNumber(row.sites)}</td>
                    <td className="num">{formatNumber(row.files)}</td>
                    <td className="num">
                      <Delta value={row.delta} />
                    </td>
                    <td className="share">
                      <ShareBar value={row.sites} max={totalSites} label={`${pct}% of all legacy sites`} />
                      <span className="muted small">{pct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
