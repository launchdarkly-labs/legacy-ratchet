import type { GroupReport } from '@legacy-ratchet/core';

import { deltaFor, formatNumber, seriesFor, type TrendPoint } from '../model';
import { Delta, Migration, ModeBadge } from './bits';
import { TrendChart } from './TrendChart';

export interface GroupTableProps {
  groups: readonly GroupReport[];
  points: readonly TrendPoint[];
  selectedId: string | undefined;
  onSelect: (groupId: string) => void;
}

export function GroupTable({ groups, points, selectedId, onSelect }: GroupTableProps) {
  return (
    <section className="panel" aria-labelledby="groups-heading">
      <div className="panel__header">
        <h2 id="groups-heading">Groups</h2>
        <p className="muted">Select a group to see its packages, files and import sites.</p>
      </div>
      {groups.length === 0 ? (
        <p className="muted">No groups are configured.</p>
      ) : (
        <div className="table-scroll">
          <table className="table groups-table">
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Owner</th>
                <th scope="col">Mode</th>
                <th scope="col">Migration</th>
                <th scope="col" className="num">
                  Sites
                </th>
                <th scope="col" className="num">
                  Files
                </th>
                <th scope="col" className="num">
                  Change
                </th>
                <th scope="col">Trend</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const selected = group.id === selectedId;
                return (
                  <tr key={group.id} className={selected ? 'is-selected' : undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        className="link-button"
                        aria-pressed={selected}
                        onClick={() => onSelect(group.id)}
                      >
                        {group.id}
                      </button>
                      {group.description && <div className="muted small">{group.description}</div>}
                    </th>
                    <td>{group.owner ?? <span className="muted">Unowned</span>}</td>
                    <td>
                      <ModeBadge mode={group.mode} />
                    </td>
                    <td>
                      <Migration from={group.old} to={group.new} />
                    </td>
                    <td className="num strong">{formatNumber(group.sites)}</td>
                    <td className="num">{formatNumber(group.files)}</td>
                    <td className="num">
                      <Delta value={deltaFor(points, group.id)} />
                    </td>
                    <td>
                      <TrendChart label={`${group.id} trend`} values={seriesFor(points, group.id)} />
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
