import type { EnforcementMode } from '@migration-tracker/core';
import type { ReactNode } from 'react';

import { formatPct } from '../progress';

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

export interface ProgressBarProps {
  value: number;
  label: string;
  title?: string;
  size?: 'small' | 'large';
}

export function ProgressBar({ value, label, title, size = 'small' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className={`progress progress--${size}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={formatPct(pct)}
      title={title}
    >
      <span className="progress__fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}
