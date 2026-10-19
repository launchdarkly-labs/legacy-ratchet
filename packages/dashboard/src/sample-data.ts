import type {
  EnforcementMode,
  GroupReport,
  HistoryEntry,
  ImportKind,
  ImportSite,
  InlineSuppression,
  ReportSnapshot,
} from '@legacy-ratchet/core';

import { siteKindOf } from './model';

interface GroupMeta {
  id: string;
  description?: string;
  owner?: string;
  docs?: string;
  mode: EnforcementMode;
  old: string[];
  new: string[];
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
  },
  {
    id: 'dates',
    description: 'Mutable date libraries replaced by date-fns and Temporal',
    owner: '@acme/frontend-infra',
    docs: 'https://engineering.example.com/migrations/dates',
    mode: 'ban',
    old: ['moment', 'moment-timezone'],
    new: ['date-fns', '@js-temporal/polyfill'],
  },
  {
    id: 'http',
    description: 'Legacy HTTP clients replaced by ky',
    mode: 'report',
    old: ['request', 'superagent', '@acme/legacy-http'],
    new: ['ky'],
  },
];

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
      });
    }
  }
  return sites.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

function summarize(meta: GroupMeta, sites: readonly ImportSite[]): GroupReport {
  const own = sites.filter((s) => s.groupId === meta.id);
  const byPackage: Record<string, number> = {};
  const byFile = new Map<string, number>();
  for (const s of own) {
    byPackage[s.packageName] = (byPackage[s.packageName] ?? 0) + 1;
    byFile.set(s.filePath, (byFile.get(s.filePath) ?? 0) + 1);
  }
  const topFiles = [...byFile]
    .map(([filePath, count]) => ({ filePath, count }))
    .sort((x, y) => y.count - x.count || x.filePath.localeCompare(y.filePath))
    .slice(0, 10);
  return { ...meta, sites: own.length, files: byFile.size, byPackage, topFiles };
}

const HISTORY_OFFSETS: Record<string, number[]> = {
  forms: [29, 26, 24, 9, 5, 2],
  dates: [17, 15, 14, 5, 3, 1],
  http: [8, 8, 7, 2, 2, 1],
};

const FIRST_IDENTITY_V2 = 3;

const HISTORY_COMMITS = ['1a2b3c4d5e', '2b3c4d5e6f', '3c4d5e6f70', '4d5e6f7081', '5e6f708192', '6f708192a3'];

function buildHistory(groups: readonly GroupReport[], generatedAt: string): HistoryEntry[] {
  const end = Date.parse(generatedAt);
  const week = 7 * 24 * 60 * 60 * 1000;
  return HISTORY_COMMITS.map((commit, i) => {
    const totals: Record<string, number> = {};
    for (const g of groups) totals[g.id] = g.sites + (HISTORY_OFFSETS[g.id]?.[i] ?? 0);
    return {
      generatedAt: new Date(end - (HISTORY_COMMITS.length - i) * week).toISOString(),
      ...(i >= FIRST_IDENTITY_V2 ? { identityVersion: 2 as const } : {}),
      revision: { commit: `${commit}${'0'.repeat(30)}`, branch: 'main' },
      totals,
    };
  });
}

function buildSample(): ReportSnapshot {
  const generatedAt = '2026-10-16T17:42:00.000Z';
  const sites = buildSites();
  const groups = GROUPS.map((g) => summarize(g, sites));
  return {
    schemaVersion: 2,
    generatedAt,
    revision: { commit: '9f3e2d1c0b4a59687766554433221100ffeeddcc', branch: 'main' },
    totalSites: sites.length,
    groups,
    sites,
    history: buildHistory(groups, generatedAt),
  };
}

export const sampleSnapshot: ReportSnapshot = buildSample();
