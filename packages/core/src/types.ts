export type EnforcementMode = 'report' | 'ratchet' | 'ban';
export type EnforcementScope = 'imports';
export type Severity = 'error' | 'warn';

export interface Enforcement {
  mode: EnforcementMode;
  scope: EnforcementScope;
  severity: Severity;
}

export interface GroupPolicy {
  description?: string;
  owner?: string;
  old: string[];
  new: string[];
  enforcement: Enforcement;
  docs?: string;
  start?: number;
}

export interface PolicyException {
  groupId: string;
  files: string[];
  reason: string;
  owner: string;
  issue?: string;
  expires: string;
}

export interface LegacyConfig {
  $schema?: string;
  version: 1;
  groups: Record<string, GroupPolicy>;
  ignore?: string[];
  exceptions?: PolicyException[];
}

export type ImportKind = 'import' | 'require' | 'dynamic-import' | 'export-from' | 'import-equals';

export type SiteKind = 'import' | 'require';

export interface InlineSuppression {
  groupIds: string[];
  reason: string;
}

export interface RawImport {
  filePath: string;
  moduleSpecifier: string;
  importKind: ImportKind;
  typeOnly: boolean;
  line?: number;
  column?: number;
  suppression?: InlineSuppression;
}

export interface ImportSite {
  id: string;
  groupId: string;
  filePath: string;
  packageName: string;
  moduleSpecifier: string;
  importKind: SiteKind;
  kinds: ImportKind[];
  typeOnly: boolean;
  sourceFingerprint: string;
  occurrences?: number;
  line?: number;
  column?: number;
  suppression?: InlineSuppression;
  owners?: string[];
}

export interface BaselineRevision {
  commit?: string;
  branch?: string;
}

export interface Baseline {
  schemaVersion: 2;
  configDigest: string;
  scannerVersion: string;
  generatedAt: string;
  revision?: BaselineRevision;
  allowed: string[];
  upgradedFrom?: 1;
}

export type ViolationReason = 'new-site' | 'banned';

export interface Violation {
  site: ImportSite;
  reason: ViolationReason;
  severity: Severity;
  message: string;
  replacements: string[];
  docs?: string;
}

export interface AppliedException {
  exception: PolicyException;
  site: ImportSite;
}

export interface ExpiredException {
  exception: PolicyException;
  index: number;
}

export interface GroupCheckSummary {
  groupId: string;
  mode: EnforcementMode;
  remaining: number;
  retired: number;
  newSites: number;
}

export interface CheckResult {
  violations: Violation[];
  retired: string[];
  existing: ImportSite[];
  suppressed: ImportSite[];
  appliedExceptions: AppliedException[];
  expiredExceptions: ExpiredException[];
  groups: GroupCheckSummary[];
  failed: boolean;
}

export interface BaselineDiff {
  added: string[];
  removed: string[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; config: LegacyConfig; issues: [] }
  | { ok: false; issues: ValidationIssue[] };

export interface AdoptionCount {
  groupId: string;
  filePath: string;
  packageName: string;
}

export interface GroupReport {
  id: string;
  description?: string;
  owner?: string;
  docs?: string;
  mode: EnforcementMode;
  old: string[];
  new: string[];
  sites: number;
  files: number;
  byPackage: Record<string, number>;
  topFiles: Array<{ filePath: string; count: number }>;
  start: number;
  completePct: number;
  newSites: number;
  adoptionPct: number | null;
  byOwner: Record<string, number>;
  byDirectory: Record<string, number>;
  startHere: Array<{ filePath: string; count: number }>;
}

export interface ReportTotals {
  sites: number;
  start: number;
  completePct: number;
  newSites: number;
  adoptionPct: number | null;
}

export interface HistoryEntry {
  generatedAt: string;
  identityVersion?: 2;
  revision?: BaselineRevision;
  totals: Record<string, number>;
  newTotals?: Record<string, number>;
}

export interface ReportSnapshot {
  schemaVersion: 2;
  generatedAt: string;
  revision?: BaselineRevision;
  totalSites: number;
  groups: GroupReport[];
  sites: ImportSite[];
  history: HistoryEntry[];
  totals?: ReportTotals;
  sourceUrlTemplate?: string;
}
