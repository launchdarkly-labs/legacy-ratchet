import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App';
import { readSnapshot } from './data';
import { sampleSnapshot } from './sample-data';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

function groupsTable() {
  const section = screen.getByRole('region', { name: 'Groups' });
  return within(section).getByRole('table');
}

describe('App', () => {
  it('renders totals and every group from a snapshot', () => {
    render(<App state={{ status: 'ready', snapshot: sampleSnapshot }} />);

    expect(screen.getByTestId('total-sites').textContent).toBe(String(sampleSnapshot.totalSites));
    expect(screen.getByTestId('group-count').textContent).toBe('3');
    expect(within(screen.getByRole('banner')).getByText('9f3e2d1 on main')).toBeTruthy();

    const table = groupsTable();
    for (const group of sampleSnapshot.groups) {
      const button = within(table).getByRole('button', { name: group.id });
      const row = button.closest('tr');
      expect(row).toBeTruthy();
      expect(within(row as HTMLElement).getByText(group.mode)).toBeTruthy();
      expect(within(row as HTMLElement).getByText(String(group.sites))).toBeTruthy();
    }

    const ownership = screen.getByRole('region', { name: 'Ownership' });
    expect(within(ownership).getByRole('rowheader', { name: 'Unowned' })).toBeTruthy();
    expect(within(ownership).getByRole('rowheader', { name: '@acme/web-platform' })).toBeTruthy();
  });

  it('shows a decreasing delta against the previous history entry', () => {
    render(<App state={{ status: 'ready', snapshot: sampleSnapshot }} />);
    const formsRow = within(groupsTable()).getByRole('button', { name: 'forms' }).closest('tr') as HTMLElement;
    expect(within(formsRow).getByText('down 2 since the previous report')).toBeTruthy();
  });

  it('shows the empty state when the data element still holds the placeholder', () => {
    document.body.innerHTML =
      '<script id="legacy-ratchet-data" type="application/json">__LEGACY_RATCHET_DATA__</script>';
    const state = readSnapshot(document);
    expect(state.status).toBe('missing');

    render(<App state={state} />);
    expect(screen.getByRole('heading', { name: 'No report data' })).toBeTruthy();
    expect(screen.getByText('legacy report --format html')).toBeTruthy();
  });

  it('shows the empty state with a reason when the data is invalid', () => {
    document.body.innerHTML = '<script id="legacy-ratchet-data" type="application/json">{nope</script>';
    render(<App state={readSnapshot(document)} />);
    expect(screen.getByText(/not valid JSON/)).toBeTruthy();
  });

  it('drills into a group and narrows sites with the filters', () => {
    render(<App state={{ status: 'ready', snapshot: sampleSnapshot }} />);
    fireEvent.click(within(groupsTable()).getByRole('button', { name: 'forms' }));

    const detail = screen.getByRole('region', { name: /^forms/ });
    const sitesTable = within(detail).getByRole('table', { name: 'Import sites in forms' });
    const formsSites = sampleSnapshot.sites.filter((s) => s.groupId === 'forms');
    expect(within(sitesTable).getAllByRole('row')).toHaveLength(formsSites.length + 1);
    expect(within(detail).getByTestId('site-count').textContent).toContain(
      `Showing ${formsSites.length} of ${formsSites.length} sites`,
    );

    fireEvent.change(within(detail).getByRole('searchbox'), { target: { value: 'checkout' } });
    const checkout = formsSites.filter((s) => s.filePath.includes('checkout'));
    expect(checkout.length).toBeGreaterThan(0);
    expect(checkout.length).toBeLessThan(formsSites.length);
    expect(within(sitesTable).getAllByRole('row')).toHaveLength(checkout.length + 1);

    fireEvent.change(within(detail).getByRole('combobox', { name: 'Package' }), { target: { value: 'formik' } });
    const checkoutFormik = checkout.filter((s) => s.packageName === 'formik');
    expect(within(sitesTable).getAllByRole('row')).toHaveLength(checkoutFormik.length + 1);

    fireEvent.click(within(detail).getByRole('button', { name: 'Clear' }));
    fireEvent.change(within(detail).getByRole('combobox', { name: 'Kind' }), { target: { value: 'require' } });
    const requires = formsSites.filter((s) => s.importKind === 'require');
    expect(requires.length).toBeGreaterThan(0);
    expect(within(sitesTable).getAllByRole('row')).toHaveLength(requires.length + 1);

    fireEvent.click(within(detail).getByRole('button', { name: 'Clear' }));
    expect(within(detail).getByText('Removed together with the store in Q4')).toBeTruthy();

    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: /^forms/ })).toBeNull();
  });

  it('opens the group named in the URL hash and keeps the hash in sync', () => {
    window.history.replaceState(null, '', '/#group=dates');
    render(<App state={{ status: 'ready', snapshot: sampleSnapshot }} />);
    expect(screen.getByRole('region', { name: /^dates/ })).toBeTruthy();
    fireEvent.click(within(groupsTable()).getByRole('button', { name: 'http' }));
    expect(window.location.hash).toBe('#group=http');
    fireEvent.click(within(groupsTable()).getByRole('button', { name: 'http' }));
    expect(window.location.hash).toBe('');
    expect(screen.queryByRole('region', { name: /^http/ })).toBeNull();
  });

  it('caps rendered site rows at 500', () => {
    const base = sampleSnapshot.sites.find((s) => s.groupId === 'http');
    if (!base) throw new Error('sample has no http site');
    const many = Array.from({ length: 1200 }, (_, i) => ({
      ...base,
      id: `http|src/gen/file${i}.ts|import|request`,
      filePath: `src/gen/file${i}.ts`,
    }));
    const snapshot = {
      ...sampleSnapshot,
      sites: many,
      totalSites: many.length,
      groups: sampleSnapshot.groups.map((g) => (g.id === 'http' ? { ...g, sites: many.length } : g)),
    };
    render(<App state={{ status: 'ready', snapshot }} />);
    fireEvent.click(within(groupsTable()).getByRole('button', { name: 'http' }));
    const detail = screen.getByRole('region', { name: /^http/ });
    expect(within(within(detail).getByRole('table', { name: 'Import sites in http' })).getAllByRole('row')).toHaveLength(
      501,
    );
    expect(within(detail).getByTestId('site-count').textContent).toContain('Showing 500 of 1,200');
  });

  it('labels site kinds, merged syntax chips, occurrences, and omits missing lines', () => {
    render(<App state={{ status: 'ready', snapshot: sampleSnapshot }} />);
    fireEvent.click(within(groupsTable()).getByRole('button', { name: 'forms' }));
    const detail = screen.getByRole('region', { name: /^forms/ });
    const sitesTable = within(detail).getByRole('table', { name: 'Import sites in forms' });

    const planPicker = within(sitesTable).getByText('src/features/billing/PlanPicker.tsx').closest('tr') as HTMLElement;
    expect(within(planPicker).getByText('ES import')).toBeTruthy();
    expect(within(planPicker).getByText('import()')).toBeTruthy();
    expect(within(planPicker).getByText('import')).toBeTruthy();
    expect(within(planPicker).getByText('\u00d72')).toBeTruthy();
    expect(within(planPicker).getByText(':3')).toBeTruthy();

    const reducer = within(sitesTable).getByText('redux-form/lib/reducer').closest('tr') as HTMLElement;
    expect(within(reducer).getByText('require')).toBeTruthy();
    expect(reducer.querySelector('.chip')).toBeNull();
    expect(reducer.querySelector('.occurrences')).toBeNull();

    const payment = within(sitesTable).getByText('redux-form/lib/Field').closest('tr') as HTMLElement;
    expect(payment.querySelector('.chip')).toBeNull();

    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
    fireEvent.click(within(groupsTable()).getByRole('button', { name: 'http' }));
    const http = screen.getByRole('table', { name: 'Import sites in http' });
    const mock = within(http)
      .getAllByText('test/mocks/http.ts')
      .map((el) => el.closest('tr') as HTMLElement)
      .find((row) => within(row).queryByText('superagent'));
    expect(mock).toBeTruthy();
    expect((mock as HTMLElement).querySelector('.path')?.textContent).toBe('test/mocks/http.ts');

    const bridge = within(http).getByText('server/legacy-bridge.ts').closest('tr') as HTMLElement;
    expect(within(bridge).getByText('require')).toBeTruthy();
    expect(within(bridge).getByText('import =')).toBeTruthy();
    expect(within(bridge).getByText('require()')).toBeTruthy();
  });

  it('explains what a site is and marks the counting change in the trend', () => {
    render(<App state={{ status: 'ready', snapshot: sampleSnapshot }} />);
    expect(within(screen.getByRole('banner')).getByText('import sites (one per file and package)')).toBeTruthy();
    const trend = screen.getByRole('region', { name: 'Trend' });
    expect(within(trend).getByRole('img', { name: /^All groups: .*Counting changed: one site per file and package from here/ })).toBeTruthy();
    expect(within(trend).getAllByTestId('identity-marker').length).toBe(1 + sampleSnapshot.groups.length);
    expect(within(trend).getByRole('rowheader', { name: /Counting changed: one site per file and package from here/ })).toBeTruthy();
  });
});
