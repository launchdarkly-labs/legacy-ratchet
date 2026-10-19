import type { EnforcementMode } from '@legacy-ratchet/core';

import { describeDelta, formatDelta } from '../model';

export function Delta({ value }: { value: number | undefined }) {
  if (value === undefined) {
    return (
      <span className="delta delta--none" title="No previous report to compare with">
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">no previous report</span>
      </span>
    );
  }
  const tone = value < 0 ? 'down' : value > 0 ? 'up' : 'flat';
  return (
    <span className={`delta delta--${tone}`} title={describeDelta(value)}>
      <span aria-hidden="true">{formatDelta(value)}</span>
      <span className="visually-hidden">{describeDelta(value)}</span>
    </span>
  );
}

const MODE_HINT: Record<EnforcementMode, string> = {
  report: 'Report only: sites are tracked but never fail checks',
  ratchet: 'Ratchet: existing sites are allowed, new sites fail checks',
  ban: 'Ban: every site fails checks unless suppressed or excepted',
};

export function ModeBadge({ mode }: { mode: EnforcementMode }) {
  return (
    <span className={`badge badge--${mode}`} title={MODE_HINT[mode] ?? mode}>
      {mode}
    </span>
  );
}

export function PackageList({ packages, empty }: { packages: readonly string[]; empty: string }) {
  if (packages.length === 0) return <span className="muted">{empty}</span>;
  return (
    <>
      {packages.map((p, i) => (
        <span key={p}>
          {i > 0 && ', '}
          <code>{p}</code>
        </span>
      ))}
    </>
  );
}

export function Migration({ from, to }: { from: readonly string[]; to: readonly string[] }) {
  return (
    <span className="migration">
      <span className="migration__old">
        <PackageList packages={from} empty="—" />
      </span>
      <span className="migration__arrow" aria-label="replaced by">
        {' → '}
      </span>
      <span className="migration__new">
        <PackageList packages={to} empty="no replacement" />
      </span>
    </span>
  );
}

export function ShareBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className="bar" aria-hidden="true" title={label}>
      <span className="bar__fill" style={{ width: `${pct}%` }} />
    </span>
  );
}
