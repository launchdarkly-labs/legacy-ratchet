import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TrendChart } from './TrendChart';

afterEach(cleanup);

describe('TrendChart', () => {
  it('renders a placeholder with no points', () => {
    render(<TrendChart label="forms" values={[]} />);
    const img = screen.getByRole('img', { name: 'forms: no trend data yet' });
    expect(img.tagName.toLowerCase()).toBe('span');
  });

  it('renders a single dot for one point', () => {
    const { container } = render(
      <TrendChart label="forms" values={[{ generatedAt: '2026-10-01T00:00:00Z', value: 12 }]} variant="full" />,
    );
    expect(screen.getByRole('img', { name: 'forms: 12 sites (1 snapshot)' })).toBeTruthy();
    expect(container.querySelector('polyline')).toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('renders a line for many points, including identical timestamps and zero values', () => {
    const values = [
      { generatedAt: '2026-09-01T00:00:00Z', value: 0 },
      { generatedAt: '2026-09-08T00:00:00Z', value: 0 },
      { generatedAt: '2026-09-15T00:00:00Z', value: 0 },
    ];
    const { container, rerender } = render(<TrendChart label="total" values={values} variant="full" />);
    expect(screen.getByRole('img', { name: 'total: 0 to 0 sites across 3 snapshots' })).toBeTruthy();
    expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(3);
    expect(container.innerHTML).not.toContain('NaN');

    const same = [
      { generatedAt: 'not a date', value: 9 },
      { generatedAt: 'not a date', value: 4 },
    ];
    rerender(<TrendChart label="total" values={same} />);
    expect(container.innerHTML).not.toContain('NaN');
    expect(container.innerHTML).not.toContain('Infinity');
    expect(screen.getByRole('img', { name: 'total: 9 to 4 sites across 2 snapshots' })).toBeTruthy();
  });

  it('draws the counting-change marker only at a later point', () => {
    const values = [
      { generatedAt: '2026-09-01T00:00:00Z', value: 30 },
      { generatedAt: '2026-09-08T00:00:00Z', value: 12 },
      { generatedAt: '2026-09-15T00:00:00Z', value: 10 },
    ];
    const { container, rerender } = render(
      <TrendChart label="total" values={values} variant="full" identityChangeAt="2026-09-08T00:00:00Z" />,
    );
    expect(container.querySelectorAll('[data-testid="identity-marker"]')).toHaveLength(1);
    expect(screen.getByRole('img', { name: /Counting changed: one site per file and package from here/ })).toBeTruthy();
    expect(container.querySelector('[data-testid="identity-marker"] title')?.textContent).toBe(
      'Counting changed: one site per file and package from here',
    );
    expect(container.innerHTML).not.toContain('NaN');

    rerender(<TrendChart label="total" values={values} variant="full" />);
    expect(container.querySelector('[data-testid="identity-marker"]')).toBeNull();

    rerender(<TrendChart label="total" values={values} variant="full" identityChangeAt="2026-09-01T00:00:00Z" />);
    expect(container.querySelector('[data-testid="identity-marker"]')).toBeNull();
    expect(screen.getByRole('img', { name: 'total: 30 to 10 sites across 3 snapshots' })).toBeTruthy();
  });
});

