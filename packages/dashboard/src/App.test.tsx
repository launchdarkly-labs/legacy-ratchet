import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App';
import { parseSnapshotText, readSnapshot } from './data';
import { sampleSnapshot } from './sample-data';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

function renderSample(snapshot = sampleSnapshot) {
  return render(<App state={{ status: 'ready', snapshot }} />);
}

function groupList() {
  const section = screen.getByRole('region', { name: 'Groups' });
  return within(section).getByRole('list');
}

function rowIds(): string[] {
  return within(groupList())
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-group-id') ?? '');
}

function openGroup(id: string) {
  fireEvent.click(within(groupList()).getByRole('button', { name: id }));
}

describe('overview', () => {
  it('shows the migrated headline, the remaining count and the revision', () => {
    renderSample();
    const totals = sampleSnapshot.totals!;
    expect(screen.getByTestId('headline').textContent).toBe(`${totals.adoptionPct}% migrated`);
    expect(screen.getByTestId('headline').getAttribute('title')).toBe(
      'Share of imports that already use the replacement packages.',
    );
    expect(screen.getByTestId('headline-sub').textContent).toBe(
      `${totals.sites} legacy imports left · ${totals.newSites} imports already on replacements`,
    );
    expect(screen.getByRole('progressbar', { name: 'Migrated overall' }).getAttribute('aria-valuenow')).toBe(
      String(totals.adoptionPct),
    );
    expect(screen.getByTestId('generated').textContent).toContain('commit 9f3e2d1 on main');
  });

  it('formats percentages with at most one decimal and thousands separators', () => {
    const snapshot = {
      ...sampleSnapshot,
      totals: { sites: 12345, start: 20000, completePct: 38.3, newSites: 6789, adoptionPct: 35.46 },
    };
    renderSample(snapshot);
    expect(screen.getByTestId('headline').textContent).toBe('35.5% migrated');
    expect(screen.getByTestId('headline-sub').textContent).toContain('12,345 legacy imports left');
    expect(screen.getByTestId('headline-sub').textContent).toContain('6,789 imports already on replacements');
  });

  it('falls back to the removed share, then to the remaining count', () => {
    renderSample({ ...sampleSnapshot, totals: { sites: 10, start: 40, completePct: 75, newSites: 0, adoptionPct: null } });
    expect(screen.getByTestId('headline').textContent).toBe('75% migrated');
    cleanup();
    renderSample({ ...sampleSnapshot, totals: { sites: 10, start: 10, completePct: 0, newSites: 0, adoptionPct: null } });
    expect(screen.getByTestId('headline').textContent).toBe('10 legacy imports left');
    expect(screen.queryByRole('progressbar', { name: 'Migrated overall' })).toBeNull();
  });

  it('lists groups least migrated first with done groups last', () => {
    renderSample();
    expect(rowIds()).toEqual(['dates', 'http', 'forms', 'icons']);
    const icons = within(groupList()).getAllByRole('listitem')[3] as HTMLElement;
    expect(within(icons).getByText('Done')).toBeTruthy();
    const dates = within(groupList()).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(dates).getByRole('progressbar', { name: 'dates migrated' })).toBeTruthy();
    expect(within(dates).getByText('@acme/frontend-infra')).toBeTruthy();
    const http = within(groupList()).getAllByRole('listitem')[1] as HTMLElement;
    expect(within(http).getByText('removed')).toBeTruthy();
    expect(within(http).getByText('Unowned')).toBeTruthy();
  });

  it('shows no bar for a group without replacements that has not shrunk', () => {
    const snapshot = {
      ...sampleSnapshot,
      groups: sampleSnapshot.groups.map((g) => (g.id === 'http' ? { ...g, start: g.sites, completePct: 0 } : g)),
    };
    renderSample(snapshot);
    const http = within(groupList()).getAllByRole('listitem').find((li) => li.getAttribute('data-group-id') === 'http')!;
    expect(within(http).queryByRole('progressbar')).toBeNull();
    expect(within(http).getByText('No replacement listed')).toBeTruthy();
  });

  it('opens a group when any part of the row is clicked', () => {
    renderSample();
    const row = within(groupList()).getAllByRole('listitem')[0] as HTMLElement;
    fireEvent.click(row.querySelector('.group-row__left') as HTMLElement);
    expect(screen.getByRole('heading', { level: 2, name: /^dates/ })).toBeTruthy();
    expect(window.location.hash).toBe('#group=dates');
  });

  it('renders an older snapshot without progress fields', () => {
    const old = {
      schemaVersion: 2,
      generatedAt: '2026-10-01T00:00:00Z',
      totalSites: 3,
      groups: [
        { id: 'a', mode: 'report', old: ['x'], new: ['y'], sites: 3, files: 2, byPackage: { x: 3 }, topFiles: [] },
        { id: 'b', mode: 'ban', old: ['z'], new: [], sites: 0, files: 0, byPackage: {}, topFiles: [] },
      ],
      sites: [
        { id: 's1', groupId: 'a', filePath: 'src/one.ts', packageName: 'x', moduleSpecifier: 'x', importKind: 'import', typeOnly: false, sourceFingerprint: 'f' },
        { id: 's2', groupId: 'a', filePath: 'src/two.ts', packageName: 'x', moduleSpecifier: 'x', importKind: 'import', typeOnly: false, sourceFingerprint: 'f' },
        { id: 's3', groupId: 'a', filePath: 'src/two.ts', packageName: 'x', moduleSpecifier: 'x', importKind: 'require', typeOnly: false, sourceFingerprint: 'f' },
      ],
      history: [{ generatedAt: '2026-09-01T00:00:00Z', totals: { a: 9 } }],
    };
    const state = parseSnapshotText(JSON.stringify(old));
    expect(state.status).toBe('ready');
    render(<App state={state} />);
    expect(screen.getByTestId('headline').textContent).toBe('3 legacy imports left');
    expect(rowIds()).toEqual(['a', 'b']);

    openGroup('a');
    expect(screen.getByTestId('group-counts').textContent).toBe('3 left');
    const breakdown = screen.getByRole('region', { name: 'Where the legacy imports are' });
    expect(within(breakdown).getByRole('button', { name: /Unowned/ })).toBeTruthy();
    expect(within(breakdown).getByRole('button', { name: /^src/ })).toBeTruthy();
    const startHere = screen.getByRole('region', { name: 'Start here' });
    expect(within(startHere).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'src/one.ts1 import',
      'src/two.ts2 imports',
    ]);
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

  it('renders no trend or history UI', () => {
    renderSample({
      ...sampleSnapshot,
      history: [{ generatedAt: '2026-09-01T00:00:00Z', totals: { forms: 50 } }],
    });
    expect(document.querySelector('svg')).toBeNull();
    expect(screen.queryByText(/trend|per week|last 30 days/i)).toBeNull();
  });
});

describe('group view', () => {
  it('shows progress, counts and the starting point', () => {
    renderSample();
    openGroup('forms');
    const forms = sampleSnapshot.groups.find((g) => g.id === 'forms')!;
    expect(screen.getByTestId('group-pct').textContent).toBe(`${forms.adoptionPct}% migrated`);
    expect(screen.getByTestId('group-counts').textContent).toBe(
      `${forms.sites} left · ${forms.newSites} on replacements · started at ${forms.start}`,
    );
    expect(screen.getByRole('link', { name: 'Migration guide' }).getAttribute('href')).toBe(forms.docs);
  });

  it('omits the starting point when nothing has been removed', () => {
    renderSample();
    openGroup('dates');
    expect(screen.getByTestId('group-counts').textContent).not.toContain('started at');
  });

  it('filters files from the breakdown bars and the filter controls', () => {
    renderSample();
    openGroup('forms');
    const formsSites = sampleSnapshot.sites.filter((s) => s.groupId === 'forms');
    const formsFiles = new Set(formsSites.map((s) => s.filePath));
    const table = () => screen.getByRole('table', { name: 'Files in forms' });
    expect(within(table()).getAllByRole('row')).toHaveLength(formsFiles.size + 1);

    const breakdown = screen.getByRole('region', { name: 'Where the legacy imports are' });
    const payments = within(breakdown).getByRole('button', { name: /^@acme\/payments/ });
    fireEvent.click(payments);
    expect(payments.getAttribute('aria-pressed')).toBe('true');
    const paymentFiles = new Set(
      formsSites.filter((s) => s.owners?.includes('@acme/payments')).map((s) => s.filePath),
    );
    expect(paymentFiles.size).toBeGreaterThan(0);
    expect(within(table()).getAllByRole('row')).toHaveLength(paymentFiles.size + 1);
    expect((screen.getByRole('combobox', { name: 'Team' }) as HTMLSelectElement).value).toBe('@acme/payments');

    fireEvent.click(within(breakdown).getByRole('button', { name: /^formik/ }));
    const both = new Set(
      formsSites
        .filter((s) => s.owners?.includes('@acme/payments') && s.packageName === 'formik')
        .map((s) => s.filePath),
    );
    expect(within(table()).getAllByRole('row')).toHaveLength(both.size + 1);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(within(breakdown).getByRole('button', { name: /^test/ }));
    expect(within(table()).getAllByRole('row').slice(1).map((r) => r.textContent)).toEqual([
      'test/utils/renderForm.tsx2@acme/web-platform',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'checkout' } });
    const checkout = [...formsFiles].filter((f) => f.includes('checkout'));
    expect(within(table()).getAllByRole('row')).toHaveLength(checkout.length + 1);
    expect(screen.getByTestId('file-count').textContent).toContain(
      `Showing ${checkout.length} of ${checkout.length} matching files (${formsFiles.size} total)`,
    );
  });

  it('keeps filters when coming back from a file', () => {
    renderSample();
    openGroup('forms');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'checkout' } });
    fireEvent.click(screen.getByRole('button', { name: 'src/features/checkout/PaymentForm.tsx' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to forms/ }));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('checkout');
  });

  it('lists the files with the fewest imports under Start here', () => {
    renderSample();
    openGroup('forms');
    const forms = sampleSnapshot.groups.find((g) => g.id === 'forms')!;
    const startHere = screen.getByRole('region', { name: 'Start here' });
    const first = forms.startHere![0]!;
    expect(within(startHere).getAllByRole('listitem')).toHaveLength(forms.startHere!.length);
    fireEvent.click(within(startHere).getByRole('button', { name: first.filePath }));
    expect(screen.getByRole('heading', { level: 2, name: first.filePath })).toBeTruthy();
  });

  it('caps rendered file rows at 500', () => {
    const base = sampleSnapshot.sites.find((s) => s.groupId === 'http')!;
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
    renderSample(snapshot);
    openGroup('http');
    expect(within(screen.getByRole('table', { name: 'Files in http' })).getAllByRole('row')).toHaveLength(501);
    expect(screen.getByTestId('file-count').textContent).toContain('Showing 500 of 1,200');
  });
});

describe('file view', () => {
  function openPlanPicker() {
    renderSample();
    openGroup('forms');
    fireEvent.click(screen.getByRole('button', { name: 'src/features/billing/PlanPicker.tsx' }));
  }

  it('lists each import with kind chips, owners and a source link', () => {
    openPlanPicker();
    expect(window.location.hash).toBe('#group=forms&file=src/features/billing/PlanPicker.tsx');
    const table = screen.getByRole('table', { name: 'Legacy imports in src/features/billing/PlanPicker.tsx' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(within(row).getByText('ES import')).toBeTruthy();
    expect(within(row).getByText('import()')).toBeTruthy();
    expect(within(row).getByText('×2')).toBeTruthy();
    expect(within(row).getByText('@acme/payments')).toBeTruthy();
    const link = within(row).getByRole('link', { name: 'View formik on source, line 3' });
    expect(link.getAttribute('href')).toBe(
      'https://example.com/acme/app/blob/9f3e2d1c0b4a59687766554433221100ffeeddcc/src/features/billing/PlanPicker.tsx#L3',
    );
    expect(screen.getByTestId('replace-with').textContent).toBe('Replace with: react-hook-form — migration guide');
  });

  it('shows suppression reasons and omits the line anchor when there is no line', () => {
    renderSample();
    openGroup('http');
    fireEvent.click(
      within(screen.getByRole('table', { name: 'Files in http' })).getByRole('button', { name: 'test/mocks/http.ts' }),
    );
    const link = screen.getByRole('link', { name: 'View superagent on source' });
    expect(link.getAttribute('href')).toBe(
      'https://example.com/acme/app/blob/9f3e2d1c0b4a59687766554433221100ffeeddcc/test/mocks/http.ts',
    );
    expect(screen.getByTestId('replace-with').textContent).toBe('Replace with: no replacement listed');

    fireEvent.click(screen.getByRole('button', { name: /Back to http/ }));
    fireEvent.click(screen.getByRole('button', { name: 'All groups' }));
    openGroup('forms');
    fireEvent.click(screen.getByRole('button', { name: 'src/store/reducers.ts' }));
    expect(screen.getByText('Removed together with the store in Q4')).toBeTruthy();
  });

  it('renders no source link without a template', () => {
    renderSample({ ...sampleSnapshot, sourceUrlTemplate: undefined });
    openGroup('forms');
    fireEvent.click(screen.getByRole('button', { name: 'src/features/billing/PlanPicker.tsx' }));
    expect(screen.queryByRole('link', { name: /on source/ })).toBeNull();
  });
});

describe('navigation', () => {
  it('restores the file view from a deep link', () => {
    window.history.replaceState(null, '', '/#group=forms&file=src/features/billing/PlanPicker.tsx');
    renderSample();
    expect(screen.getByRole('heading', { level: 2, name: 'src/features/billing/PlanPicker.tsx' })).toBeTruthy();
  });

  it('restores the group view from a deep link and ignores unknown files and groups', () => {
    window.history.replaceState(null, '', '/#group=dates&file=nope.ts');
    renderSample();
    expect(screen.getByRole('heading', { level: 2, name: /^dates/ })).toBeTruthy();
    cleanup();
    window.history.replaceState(null, '', '/#group=missing');
    renderSample();
    expect(screen.getByRole('region', { name: 'Groups' })).toBeTruthy();
  });

  it('goes back through the levels with the back buttons and returns focus to the row', () => {
    renderSample();
    openGroup('forms');
    fireEvent.click(screen.getByRole('button', { name: 'src/features/billing/PlanPicker.tsx' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to forms/ }));
    expect(window.location.hash).toBe('#group=forms');
    expect(screen.getByRole('heading', { level: 2, name: /^forms/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /All groups/ }));
    expect(window.location.hash).toBe('');
    expect(document.activeElement?.textContent).toBe('forms');
  });

  it('follows browser history', () => {
    renderSample();
    openGroup('dates');
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('region', { name: 'Groups' })).toBeTruthy();
  });
});
