import type { EnforcementMode, ImportKind, ImportSite, InlineSuppression } from '@legacy-ratchet/core';

import { type DashboardGroup, directoryOf, ownerOf, type SeriesSnapshot, siteKindOf, siteOwners } from './model';

interface GroupMeta {
  id: string;
  description?: string;
  owner?: string;
  docs?: string;
  mode: EnforcementMode;
  old: string[];
  new: string[];
  start: number;
  newSites: number;
}

interface SiteSeed {
  file: string;
  spec: string;
  kind?: ImportKind;
  line?: number;
  typeOnly?: boolean;
  suppression?: InlineSuppression;
}

const GROUPS: GroupMeta[] = [
  {
    id: 'forms',
    description: 'Form state libraries replaced by react-hook-form',
    owner: '@acme/web-platform',
    docs: 'https://engineering.example.com/migrations/forms',
    mode: 'ratchet',
    old: ['redux-form', 'formik'],
    new: ['react-hook-form'],
    start: 74,
    newSites: 142,
  },
  {
    id: 'dates',
    description: 'Mutable date libraries replaced by date-fns and Temporal',
    owner: '@acme/frontend-infra',
    docs: 'https://engineering.example.com/migrations/dates',
    mode: 'ban',
    old: ['moment', 'moment-timezone'],
    new: ['date-fns', '@js-temporal/polyfill'],
    start: 0,
    newSites: 2,
  },
  {
    id: 'http',
    description: 'Legacy HTTP clients to remove; use the built-in fetch',
    mode: 'report',
    old: ['request', 'superagent', '@acme/legacy-http'],
    new: [],
    start: 21,
    newSites: 0,
  },
  {
    id: 'icons',
    description: 'Icon font replaced by inline SVG components',
    owner: '@acme/design-system',
    docs: 'https://engineering.example.com/migrations/icons',
    mode: 'ban',
    old: ['font-awesome'],
    new: ['@acme/icons'],
    start: 48,
    newSites: 61,
  },
];

const CODEOWNERS: Array<[string, string[]]> = [
  ['src/features/checkout/', ['@acme/payments']],
  ['src/features/billing/', ['@acme/payments']],
  ['src/features/account/', ['@acme/identity']],
  ['src/features/admin/', ['@acme/identity', '@acme/security']],
  ['src/features/reports/', ['@acme/insights']],
  ['src/features/calendar/', ['@acme/insights']],
  ['src/components/', ['@acme/design-system']],
  ['src/lib/time/', ['@acme/frontend-infra']],
  ['server/', ['@acme/backend']],
  ['src/api/', ['@acme/backend']],
];

function ownersFor(filePath: string): string[] | undefined {
  let owners: string[] | undefined;
  for (const [prefix, list] of CODEOWNERS) if (filePath.startsWith(prefix)) owners = list;
  return owners;
}

const SEEDS: Record<string, SiteSeed[]> = {
  forms: [
    { file: 'src/features/checkout/PaymentForm.tsx', spec: 'redux-form', line: 8 },
    { file: 'src/features/checkout/PaymentForm.tsx', spec: 'redux-form/lib/Field', line: 9 },
    { file: 'src/features/checkout/ShippingForm.tsx', spec: 'redux-form', line: 4 },
    { file: 'src/features/checkout/ShippingForm.tsx', spec: 'redux-form', kind: 'import', line: 5, typeOnly: true },
    { file: 'src/features/checkout/AddressFields.tsx', spec: 'redux-form', line: 3 },
    { file: 'src/features/checkout/PromoCode.tsx', spec: 'formik', line: 2 },
    { file: 'src/features/account/ProfileForm.tsx', spec: 'formik', line: 6 },
    { file: 'src/features/account/ProfileForm.tsx', spec: 'formik', line: 7, typeOnly: true },
    { file: 'src/features/account/PasswordForm.tsx', spec: 'formik', line: 5 },
    { file: 'src/features/account/NotificationsForm.tsx', spec: 'formik', line: 4 },
    { file: 'src/features/account/DeleteAccount.tsx', spec: 'formik', line: 11 },
    { file: 'src/features/admin/UserEditor.tsx', spec: 'redux-form', line: 12 },
    { file: 'src/features/admin/UserEditor.tsx', spec: 'redux-form/immutable', line: 13 },
    { file: 'src/features/admin/RoleEditor.tsx', spec: 'redux-form', line: 7 },
    { file: 'src/features/admin/AuditFilters.tsx', spec: 'formik', line: 3 },
    { file: 'src/features/onboarding/WelcomeSurvey.tsx', spec: 'formik', line: 9 },
    { file: 'src/features/onboarding/InviteTeam.tsx', spec: 'formik', line: 4 },
    { file: 'src/components/forms/TextField.tsx', spec: 'redux-form', line: 2, typeOnly: true },
    { file: 'src/components/forms/SelectField.tsx', spec: 'redux-form', line: 2, typeOnly: true },
    { file: 'src/components/forms/index.ts', spec: 'redux-form', kind: 'export-from', line: 1 },
    { file: 'src/components/forms/index.ts', spec: 'formik', kind: 'export-from', line: 2 },
    { file: 'src/store/reducers.ts', spec: 'redux-form', line: 3 },
    {
      file: 'src/store/reducers.ts',
      spec: 'redux-form/lib/reducer',
      kind: 'require',
      line: 21,
      suppression: { groupIds: ['forms'], reason: 'Removed together with the store in Q4' },
    },
    { file: 'src/features/search/SearchBar.tsx', spec: 'formik', line: 5 },
    { file: 'src/features/billing/CardForm.tsx', spec: 'redux-form', line: 6 },
    { file: 'src/features/billing/InvoiceFilters.tsx', spec: 'formik', line: 3 },
    { file: 'src/features/billing/PlanPicker.tsx', spec: 'formik', line: 3, typeOnly: true },
    { file: 'src/features/billing/PlanPicker.tsx', spec: 'formik', kind: 'dynamic-import', line: 44 },
    { file: 'test/utils/renderForm.tsx', spec: 'redux-form', line: 1 },
    { file: 'test/utils/renderForm.tsx', spec: 'formik', line: 2 },
  ],
  dates: [
    { file: 'src/lib/time/format.ts', spec: 'moment', line: 1 },
    { file: 'src/lib/time/format.ts', spec: 'moment-timezone', line: 2 },
    {
      file: 'src/lib/time/legacyAdapter.ts',
      spec: 'moment',
      line: 3,
      suppression: { groupIds: [], reason: 'Adapter used by the moment-to-Temporal codemod' },
    },
    { file: 'src/features/reports/DateRangePicker.tsx', spec: 'moment', line: 4 },
    { file: 'src/features/reports/DateRangePicker.tsx', spec: 'moment', line: 5, typeOnly: true },
    { file: 'src/features/reports/ScheduleEditor.tsx', spec: 'moment-timezone', line: 6 },
    { file: 'src/features/reports/ExportDialog.tsx', spec: 'moment', line: 3 },
    { file: 'src/features/billing/InvoiceTable.tsx', spec: 'moment', line: 8 },
    {
      file: 'src/features/billing/InvoiceTable.tsx',
      spec: 'moment/locale/de',
      line: 9,
      suppression: { groupIds: ['dates'], reason: '' },
    },
    { file: 'src/features/admin/AuditLog.tsx', spec: 'moment', line: 5 },
    { file: 'scripts/seed.js', spec: 'moment', kind: 'require', line: 2 },
    { file: 'scripts/rotate-logs.js', spec: 'moment-timezone', kind: 'require', line: 4 },
    { file: 'src/lib/time/index.ts', spec: 'moment', kind: 'export-from', line: 3, typeOnly: true },
    { file: 'src/features/calendar/MonthView.tsx', spec: 'moment', line: 2 },
    { file: 'src/features/calendar/WeekView.tsx', spec: 'moment', line: 2 },
    { file: 'src/features/calendar/agenda.ts', spec: 'moment', line: 1 },
    { file: 'src/features/calendar/agenda.ts', spec: 'moment', kind: 'dynamic-import', line: 18 },
    { file: 'src/features/calendar/agenda.ts', spec: 'moment', kind: 'dynamic-import', line: 52 },
  ],
  http: [
    { file: 'server/proxy.js', spec: 'request', kind: 'require', line: 3 },
    { file: 'server/proxy.js', spec: 'request', kind: 'require', line: 77 },
    { file: 'server/webhooks.js', spec: 'request', kind: 'require', line: 5 },
    { file: 'server/legacy-bridge.ts', spec: 'request', kind: 'import-equals', line: 1 },
    { file: 'server/legacy-bridge.ts', spec: 'request', kind: 'require', line: 30 },
    { file: 'server/health.js', spec: 'superagent', kind: 'require', line: 2 },
    { file: 'src/api/client.ts', spec: '@acme/legacy-http', line: 1 },
    { file: 'src/api/client.ts', spec: '@acme/legacy-http/interceptors', line: 2 },
    { file: 'src/api/uploads.ts', spec: 'superagent', line: 4 },
    { file: 'src/api/index.ts', spec: '@acme/legacy-http', kind: 'export-from', line: 1, typeOnly: true },
    { file: 'src/features/reports/ExportDialog.tsx', spec: 'superagent', kind: 'dynamic-import', line: 61 },
    { file: 'src/features/admin/ImpersonateUser.tsx', spec: '@acme/legacy-http', line: 6 },
    { file: 'test/mocks/http.ts', spec: 'superagent' },
    { file: 'test/mocks/http.ts', spec: '@acme/legacy-http', line: 2, typeOnly: true },
  ],
};

function fakeFingerprint(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

function packageOf(spec: string, packages: readonly string[]): string {
  const matches = packages.filter((p) => spec === p || spec.startsWith(`${p}/`));
  return matches.sort((x, y) => y.length - x.length)[0] ?? spec;
}

function suppressesGroup(s: InlineSuppression | undefined, groupId: string): boolean {
  return s !== undefined && s.reason.trim() !== '' && (s.groupIds.length === 0 || s.groupIds.includes(groupId));
}

function buildSites(): ImportSite[] {
  const sites: ImportSite[] = [];
  for (const group of GROUPS) {
    const merged = new Map<string, SiteSeed[]>();
    const seeds = [...(SEEDS[group.id] ?? [])].sort((x, y) => (x.line ?? 1) - (y.line ?? 1));
    for (const seed of seeds) {
      const id = `${group.id}|${seed.file}|${siteKindOf(seed.kind ?? 'import')}|${seed.spec}`;
      merged.set(id, [...(merged.get(id) ?? []), seed]);
    }
    for (const [id, occurrences] of merged) {
      const first = occurrences[0];
      if (!first) continue;
      const kind = siteKindOf(first.kind ?? 'import');
      const position = occurrences.find((o) => !suppressesGroup(o.suppression, group.id)) ?? first;
      const suppression = occurrences.every((o) => suppressesGroup(o.suppression, group.id))
        ? first.suppression
        : occurrences.find((o) => o.suppression && o.suppression.reason.trim() === '')?.suppression;
      sites.push({
        id,
        groupId: group.id,
        filePath: first.file,
        packageName: packageOf(first.spec, group.old),
        moduleSpecifier: first.spec,
        importKind: kind,
        kinds: [...new Set(occurrences.map((o) => o.kind ?? 'import'))].sort(),
        typeOnly: occurrences.every((o) => o.typeOnly === true),
        sourceFingerprint: fakeFingerprint(`${kind}\u0000${first.spec}`),
        occurrences: occurrences.length,
        ...(position.line !== undefined ? { line: position.line, column: kind === 'require' ? 25 : 20 } : {}),
        ...(suppression ? { suppression } : {}),
        ...(ownersFor(first.file) ? { owners: ownersFor(first.file) } : {}),
      });
    }
  }
  return sites.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function count<T>(items: readonly T[], keysOf: (item: T) => string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) for (const key of keysOf(item)) out[key] = (out[key] ?? 0) + 1;
  return out;
}

function summarize(meta: GroupMeta, sites: readonly ImportSite[]): DashboardGroup {
  const own = sites.filter((s) => s.groupId === meta.id);
  const byPackage = count(own, (s) => [s.packageName]);
  const byFile = count(own, (s) => [s.filePath]);
  const files = Object.entries(byFile).map(([filePath, n]) => ({ filePath, count: n }));
  const topFiles = [...files].sort((x, y) => y.count - x.count || x.filePath.localeCompare(y.filePath)).slice(0, 10);
  const startHere = [...files].sort((x, y) => x.count - y.count || x.filePath.localeCompare(y.filePath)).slice(0, 10);
  const start = Math.max(meta.start, own.length);
  return {
    ...meta,
    sites: own.length,
    files: files.length,
    byPackage,
    topFiles,
    start,
    completePct: start === 0 ? 100 : round1(((start - own.length) / start) * 100),
    adoptionPct:
      meta.new.length === 0 || meta.newSites + own.length === 0
        ? null
        : round1((meta.newSites / (meta.newSites + own.length)) * 100),
    byOwner: count(own, (s) => siteOwners(s, ownerOf(meta))),
    byDirectory: count(own, (s) => [directoryOf(s.filePath)]),
    startHere,
  };
}

function buildSample(): SeriesSnapshot {
  const generatedAt = '2026-10-16T17:42:00.000Z';
  const sites = buildSites();
  const groups = GROUPS.map((g) => summarize(g, sites));
  const start = groups.reduce((sum, g) => sum + (g.start ?? 0), 0);
  const newSites = groups.reduce((sum, g) => sum + (g.newSites ?? 0), 0);
  return {
    schemaVersion: 2,
    generatedAt,
    revision: { commit: '9f3e2d1c0b4a59687766554433221100ffeeddcc', branch: 'main' },
    totalSites: sites.length,
    groups,
    sites,
    history: [],
    totals: {
      sites: sites.length,
      start,
      completePct: round1(((start - sites.length) / start) * 100),
      newSites,
      adoptionPct: round1((newSites / (newSites + sites.length)) * 100),
    },
    sourceUrlTemplate: 'https://example.com/acme/app/blob/{sha}/{path}#L{line}',
  };
}

export const sampleSnapshot: SeriesSnapshot = buildSample();
