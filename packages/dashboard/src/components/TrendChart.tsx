import { useId } from 'react';

import { formatNumber, formatShortDate, IDENTITY_CHANGE_NOTE, type SeriesValue } from '../model';

export interface TrendChartProps {
  label: string;
  values: readonly SeriesValue[];
  variant?: 'spark' | 'full';
  identityChangeAt?: string;
}

interface Layout {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

const LAYOUTS: Record<'spark' | 'full', Layout> = {
  spark: { width: 120, height: 32, padLeft: 3, padRight: 3, padTop: 4, padBottom: 4 },
  full: { width: 640, height: 180, padLeft: 44, padRight: 16, padTop: 14, padBottom: 26 },
};

export function markerIndex(values: readonly SeriesValue[], identityChangeAt: string | undefined): number {
  if (identityChangeAt === undefined) return -1;
  const index = values.findIndex((v) => v.generatedAt === identityChangeAt);
  return index > 0 ? index : -1;
}

export function describeTrend(label: string, values: readonly SeriesValue[], identityChangeAt?: string): string {
  const first = values[0];
  const last = values[values.length - 1];
  if (!first || !last) return `${label}: no trend data yet`;
  if (values.length === 1) return `${label}: ${formatNumber(last.value)} sites (1 snapshot)`;
  const base = `${label}: ${formatNumber(first.value)} to ${formatNumber(last.value)} sites across ${values.length} snapshots`;
  const marker = values[markerIndex(values, identityChangeAt)];
  return marker ? `${base}. ${IDENTITY_CHANGE_NOTE} (${formatShortDate(marker.generatedAt)})` : base;
}

function xPositions(values: readonly SeriesValue[], left: number, right: number): number[] {
  if (values.length === 1) return [(left + right) / 2];
  const times = values.map((v) => Date.parse(v.generatedAt));
  const valid = times.every((t) => !Number.isNaN(t));
  const min = valid ? Math.min(...times) : 0;
  const max = valid ? Math.max(...times) : 0;
  if (valid && max > min) return times.map((t) => left + ((t - min) / (max - min)) * (right - left));
  return values.map((_, i) => left + (i / (values.length - 1)) * (right - left));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export function TrendChart({ label, values, variant = 'spark', identityChangeAt }: TrendChartProps) {
  const titleId = useId();
  const description = describeTrend(label, values, identityChangeAt);

  if (values.length === 0) {
    return (
      <span className={`trend trend--${variant} trend--empty`} role="img" aria-label={description}>
        No history yet
      </span>
    );
  }

  const layout = LAYOUTS[variant];
  const left = layout.padLeft;
  const right = layout.width - layout.padRight;
  const top = layout.padTop;
  const bottom = layout.height - layout.padBottom;
  const maxValue = Math.max(1, ...values.map((v) => v.value));
  const xs = xPositions(values, left, right);
  const y = (value: number) => bottom - (value / maxValue) * (bottom - top);
  const points = values.map((v, i) => [round(xs[i] ?? left), round(y(v.value))] as const);
  const line = points.map(([px, py]) => `${px},${py}`).join(' ');
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const area =
    firstPoint && lastPoint && points.length > 1
      ? `M${firstPoint[0]},${bottom} L${points.map(([px, py]) => `${px},${py}`).join(' L')} L${lastPoint[0]},${bottom} Z`
      : undefined;
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const markerAt = markerIndex(values, identityChangeAt);
  const markerX = markerAt >= 0 ? round(xs[markerAt] ?? left) : undefined;

  return (
    <svg
      className={`trend trend--${variant}`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-labelledby={titleId}
      data-points={values.length}
    >
      <title id={titleId}>{description}</title>
      {variant === 'full' && (
        <g className="trend__axis" aria-hidden="true">
          <line x1={left} x2={right} y1={bottom} y2={bottom} />
          <line x1={left} x2={right} y1={top} y2={top} className="trend__grid" />
          <text x={left - 6} y={top + 4} textAnchor="end">
            {formatNumber(maxValue)}
          </text>
          <text x={left - 6} y={bottom + 4} textAnchor="end">
            0
          </text>
          {firstValue && values.length > 1 && (
            <text x={left} y={layout.height - 6} textAnchor="start">
              {formatShortDate(firstValue.generatedAt)}
            </text>
          )}
          {lastValue && (
            <text x={values.length > 1 ? right : (left + right) / 2} y={layout.height - 6} textAnchor={values.length > 1 ? 'end' : 'middle'}>
              {formatShortDate(lastValue.generatedAt)}
            </text>
          )}
        </g>
      )}
      {markerX !== undefined && (
        <g className="trend__marker" data-testid="identity-marker">
          <title>{IDENTITY_CHANGE_NOTE}</title>
          <line x1={markerX} x2={markerX} y1={top} y2={bottom} vectorEffect="non-scaling-stroke" />
          <line className="trend__marker-hit" x1={markerX} x2={markerX} y1={top} y2={bottom} />
          {variant === 'full' && (
            <text
              x={markerX > (left + right) / 2 ? markerX - 4 : markerX + 4}
              y={top + 10}
              textAnchor={markerX > (left + right) / 2 ? 'end' : 'start'}
              aria-hidden="true"
            >
              Counting changed
            </text>
          )}
        </g>
      )}
      {area && <path className="trend__area" d={area} aria-hidden="true" />}
      {points.length > 1 && (
        <polyline className="trend__line" points={line} fill="none" vectorEffect="non-scaling-stroke" aria-hidden="true" />
      )}
      {variant === 'full'
        ? points.map(([px, py], i) => (
            <circle key={i} className="trend__dot" cx={px} cy={py} r={i === points.length - 1 ? 4 : 3}>
              <title>{`${formatShortDate(values[i]?.generatedAt ?? '')}: ${formatNumber(values[i]?.value ?? 0)} sites`}</title>
            </circle>
          ))
        : lastPoint && (
            <circle
              className="trend__dot"
              cx={lastPoint[0]}
              cy={lastPoint[1]}
              r={2.5}
              aria-hidden="true"
            />
          )}
    </svg>
  );
}
