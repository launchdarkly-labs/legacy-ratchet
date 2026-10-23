# Internal contract (source of truth for all packages)

Types live in `packages/core/src/types.ts`. Do not change them without updating this file.

## Package boundaries

- `@migration-tracker/core` — pure: no filesystem, process, or git access. Exports everything below.
- `@migration-tracker/scanner` — filesystem + TypeScript compiler API. Policy-agnostic: it emits `RawImport[]`.
- `@migration-tracker/cli` — composes scanner + core; owns all file IO for `migrations.json`, `.migrations/baseline.json`, `.migrations/history.jsonl`, git calls.
- `eslint-plugin-migration-tracker` — uses core only (never scanner); builds `RawImport`s from ESTree.
- `@migration-tracker/dashboard` — React app built to one self-contained `dist/index.html`. Reads a `ReportSnapshot` from `<script id="migration-tracker-data" type="application/json">…</script>` in the document.

## core exports (exact signatures)

```ts
export * from './types.js';
export const CONFIG_FILENAME = 'migrations.json';
export const BASELINE_PATH = '.migrations/baseline.json';
export const HISTORY_PATH = '.migrations/history.jsonl';
export const CORE_VERSION: string;                 // equals package version, e.g. '0.2.0'

export function validateConfig(input: unknown): ValidationResult;
export function parseConfig(json: string): ValidationResult; // JSON.parse errors become an issue at path ''
export function configDigest(config: LegacyConfig): string;  // 'sha256:' + hex of stable-key-sorted JSON of {version, groups}
export function matchPackage(moduleSpecifier: string, packages: readonly string[]): string | undefined;
export function packageNameOf(moduleSpecifier: string): string | undefined; // undefined for relative/absolute/'node:'/URL specifiers
export function findGroup(config: LegacyConfig, moduleSpecifier: string): { groupId: string; packageName: string } | undefined;
export function siteKindOf(kind: ImportKind): SiteKind;
export function fingerprint(importKind: SiteKind, moduleSpecifier: string): string;
export function siteId(s: Pick<ImportSite,'groupId'|'filePath'|'importKind'|'moduleSpecifier'>): string;
export function parseSiteId(id: string): Pick<ImportSite,'groupId'|'filePath'|'importKind'|'moduleSpecifier'>;
export function migrateSiteIdV1(id: string): string | undefined;
export function siteIdForImport(config: LegacyConfig, raw: RawImport): string | undefined;
export function normalizePath(filePath: string, root?: string): string; // repo-relative POSIX, no leading './'
export function collectSites(config: LegacyConfig, raw: readonly RawImport[]): ImportSite[];
export function enrichSites(base: readonly ImportSite[], located: readonly ImportSite[]): { sites: ImportSite[]; unlocated: ImportSite[]; extra: string[] };
export function createBaseline(sites: readonly ImportSite[], meta: { config: LegacyConfig; scannerVersion: string; revision?: BaselineRevision; now?: Date }): Baseline;
export function updateBaseline(previous: Baseline, sites: readonly ImportSite[], meta: { config: LegacyConfig; scannerVersion: string; revision?: BaselineRevision; now?: Date }): { baseline: Baseline; removed: string[] };
export function diffBaselines(base: Baseline, candidate: Baseline): BaselineDiff;
export function reconcileMigratedBaseline(v1: Baseline, current: readonly ImportSite[], meta: BaselineMeta): { baseline: Baseline; added: string[]; dropped: string[] };
export function parseBaseline(json: string): Baseline;           // throws Error with a readable message on invalid input; upgrades v1 in memory
export function serializeBaseline(b: Baseline): string;          // 2-space JSON, allowed sorted, trailing newline, never upgradedFrom
export function evaluate(config: LegacyConfig, sites: readonly ImportSite[], baseline: Baseline | undefined, opts?: { now?: Date }): CheckResult;
export function buildReport(config: LegacyConfig, sites: readonly ImportSite[], opts?: { history?: HistoryEntry[]; revision?: BaselineRevision; now?: Date; topFiles?: number; adoption?: readonly AdoptionCount[]; sourceUrlTemplate?: string }): ReportSnapshot; // progress fields: see CONTRACT-PROGRESS.md
export function historyEntry(report: ReportSnapshot): HistoryEntry;
export function formatViolation(v: Violation): string;            // plain text, no color, see CLI example
```

## Semantics (pinned — implement exactly)

**Config validation** (`validateConfig`, zod v4):
- `version` must be `1`. `groups` keys must match `/^[a-z0-9][a-z0-9_-]*$/`. At least one group.
- `old` non-empty array of valid npm package names (`name` or `@scope/name`; subpaths NOT allowed in config). `new` array (may be empty).
- `enforcement` defaults `{ mode: 'report', scope: 'imports', severity: 'error' }`; each field individually defaulted. `scope` only `'imports'`.
- `docs` must be a URL if present. Unknown top-level or group keys are errors (strict), except `$schema`.
- Conflicts (reported as issues, path like `groups.forms.old[1]`): same package in `old` of two groups; a package both in some group's `old` and some group's `new`; duplicate within an array.
- `exceptions[].groupId` must reference an existing group; `expires` must be `YYYY-MM-DD` and a real date; `files` non-empty glob strings; `reason`, `owner` non-empty.
- `ignore`: array of globs.
- On success, return the config with defaults applied.

**Matching**: `matchPackage(spec, pkgs)` returns `p` where `spec === p || spec.startsWith(p + '/')`. `redux-form-extra` does not match `redux-form`. `@company/legacy-forms/x` matches `@company/legacy-forms`. Relative (`./`, `../`), absolute (`/`), `node:` and URL specifiers never match. Longest match wins if several.
`packageNameOf('@a/b/c') === '@a/b'`, `packageNameOf('lodash/fp') === 'lodash'`.

**Identity** (file-level, `schemaVersion: 2`):
- `ImportKind` is the syntactic kind: `import`, `require`, `dynamic-import`, `export-from`, `import-equals`. `SiteKind` is the module-system kind: `siteKindOf` maps `import`/`export-from`/`dynamic-import` → `import` and `require`/`import-equals` → `require`.
- `siteId` = `${groupId}|${filePath}|${importKind}|${moduleSpecifier}` where `importKind` is a `SiteKind`. There is no occurrence: every import of the same specifier with the same module system in a file is one site. This matches dependency-cruiser's per-file merge key.
- `parseSiteId` is its inverse: split on `|`, exactly 4 parts, kind must be a `SiteKind`. A 5-part (v1) id throws an error telling the user to run `migration-tracker baseline migrate`.
- `migrateSiteIdV1(id)`: 5-part v1 id → 4-part v2 id (drops the occurrence, maps the kind with `siteKindOf`); `undefined` if malformed.
- `siteIdForImport(config, raw)` = the id `collectSites` would give `raw` (`findGroup` + `normalizePath` + `siteKindOf`), or `undefined` if no group matches.
- `fingerprint(kind, spec)` = first 16 hex chars of sha256 of `${kind}\u0000${spec}` (use `node:crypto`), with the `SiteKind`.
- `RawImport.line`/`column` are optional. Line/column (1-based) are diagnostic only and never part of identity.
- `collectSites` drops raw imports that match no group, normalizes `filePath`, and merges raw imports by `(filePath, groupId, siteKind, moduleSpecifier)`. Output is sorted by id. For each site, occurrences are ordered by `(line, column)`, missing values last:
  - `kinds` = sorted unique syntactic kinds; `typeOnly` = every occurrence is type-only (type-only imports still count); `occurrences` = count, set only when every occurrence has a line.
  - Position (`line`/`column`) = the first occurrence with a line that is not suppressed for the group, else the first occurrence with a line, else none.
  - `suppression` = the first occurrence's suppression if EVERY occurrence is suppressed for the group (non-empty reason, `groupIds` empty or containing the group). Otherwise the first empty-reason suppression, if any (not honoured, but lets the CLI warn). Otherwise none. One comment never covers other imports of the same specifier.
- `enrichSites(base, located)`: for each base site, copy `line`, `column`, `suppression`, `typeOnly`, `kinds`, `occurrences` from the located site with the same id. The id set always comes from `base`. `unlocated` = base sites with no match (kept as-is in `sites`); `extra` = located ids not in base, sorted.

**Evaluate** (`evaluate`):
- For each site, look up its group's enforcement.
- A site is *suppressed* if `site.suppression` exists, has a non-empty reason, and its `groupIds` is empty (means all) or includes `site.groupId`. Suppressed sites never violate; listed in `suppressed`.
- A site is *excepted* if a non-expired exception with matching `groupId` has a `files` glob (picomatch, `dot: true`) matching `site.filePath`. Listed in `appliedExceptions`; never violates.
- An exception is expired when `expires` < today (UTC date of `opts.now ?? new Date()`), i.e. it is still valid ON its expiry date. Expired exceptions go to `expiredExceptions` (with their index in `config.exceptions`) and do NOT excuse sites. Any expired exception makes `failed = true`.
- `mode: 'report'` → never a violation.
- `mode: 'ratchet'` → violation (`reason: 'new-site'`) iff `baseline` is undefined OR neither `site.id` nor any id with the same `groupId` and `filePath` is in `baseline.allowed`. Otherwise it goes in `existing`.
- `mode: 'ban'` → every non-suppressed, non-excepted site is a violation (`reason: 'banned'`), regardless of baseline.
- `failed` = any violation with `severity: 'error'` OR any expired exception.
- `retired` = ids in `baseline.allowed` whose group still exists, that are not present in `sites`, and whose `groupId` and `filePath` match no site in `sites`. Sorted. `updateBaseline` removes exactly the ids that are not present and whose file has no site of the same group.
- `groups`: one summary per config group (in config key order). `remaining` = count of current sites in group; `retired` = retired ids for group; `newSites` = violations in group.
- Violation `message`: `New import of "${spec}" is not allowed.` for new-site; `Import of "${spec}" is banned.` for banned. `replacements` = group.new; `docs` = group.docs.

**formatViolation** output (no trailing newline):
```
✖ forms: src/features/checkout/PaymentForm.tsx:8
  New import of "redux-form" is not allowed.
  Preferred replacement: "react-hook-form"
  Migration guide: https://engineering.example.com/migrations/forms
```
Use `⚠` instead of `✖` for severity `warn`. Multiple replacements: `Preferred replacements: "a", "b"`. Omit the replacement line if `new` is empty; omit the guide line if no docs.

**Baselines**:
- Written as `schemaVersion: 2`. `parseBaseline` accepts 1 or 2. A v1 baseline is upgraded in memory: each id goes through `migrateSiteIdV1` (malformed ids dropped), the result is sorted and de-duplicated, and the baseline is marked `upgradedFrom: 1` (never serialized).
- `createBaseline` → `allowed` = sorted unique ids of all sites (whatever mode). `generatedAt` = ISO string of `now`.
- `updateBaseline` is monotonic: new `allowed` = `previous.allowed ∩ current site ids` (never adds). `removed` = previous minus new, sorted. Refreshes digest/scannerVersion/generatedAt/revision.
- `diffBaselines` → `added` = in candidate not base; `removed` = in base not candidate; both sorted. When `base.upgradedFrom === 1`, a candidate id is not added if its `(group, file, specifier)` exists in base under any kind, so `verify --base` works across the migration.
- `reconcileMigratedBaseline(v1, current, meta)` → `allowed` = v1 ids mapped to v2 that are present in `current`, plus current ids whose `(group, file, specifier)` appears in v1 under any kind (covers `import x = require()` moving from `import` to `require`). It never allows a `(file, specifier)` pair v1 lacked. `added` = ids allowed only through that kind-less match; `dropped` = mapped ids not present now. Used by `migration-tracker baseline migrate`.

**Report** (`buildReport`, `schemaVersion: 2`): `groups` in config key order including groups with 0 sites; `byPackage` keyed by `packageName`; `topFiles` sorted by count desc then path asc, limited to `opts.topFiles ?? 10`; `history` = `opts.history ?? []`. `historyEntry` = `{ generatedAt, identityVersion: 2, revision, totals: { [groupId]: sites }, newTotals: { [groupId]: newSites } }`. Progress, adoption and ownership fields are specified in [CONTRACT-PROGRESS.md](CONTRACT-PROGRESS.md).

## scanner exports (exact signatures)

```ts
export const SCANNER_VERSION: string; // package version
export const DEFAULT_EXTENSIONS: readonly string[]; // ['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs']
export const DEFAULT_IGNORE: readonly string[];     // ['**/node_modules/**','**/dist/**','**/build/**','**/coverage/**','**/.git/**','**/*.d.ts','**/.next/**','**/out/**']
export function scanSource(code: string, filePath: string): RawImport[]; // filePath copied as given
export function listFiles(opts: { root: string; ignore?: readonly string[]; files?: readonly string[] }): Promise<string[]>; // repo-relative POSIX, sorted
export function scanFiles(opts: { root: string; ignore?: readonly string[]; files?: readonly string[]; concurrency?: number }): Promise<{ imports: RawImport[]; files: number; errors: { filePath: string; message: string }[] }>;
```
- `files`, when given, restricts scanning to those (repo-relative) paths that exist and have a default extension and are not ignored.
- Detects: `import x from 'm'`, `import 'm'`, `import type`, `import x = require('m')`, `export * from 'm'`, `export {a} from 'm'`, `export type {a} from 'm'`, `require('m')` (identifier `require` called with one string literal or no-substitution template literal), `import('m')` with string literal / no-substitution template, `require.resolve` is NOT counted. `jest.mock('m')` / `vi.mock('m')` NOT counted. Non-literal dynamic specifiers are ignored.
- `importKind`: `import`, `import-equals` (`import x = require('m')`), `require`, `dynamic-import`, `export-from`. `typeOnly` true for `import type`/`export type` and for `import { type a, type b }` when every specifier is type-only.
- Line/column 1-based, of the module specifier string literal's start (the quote).
- Inline suppressions: a comment on the line directly above the import statement (or trailing on the same line) of the form
  `// migration-tracker-disable-next-line [groupId[,groupId...]] -- reason` (above) or `// migration-tracker-disable-line [groupIds] -- reason` (same line). Block comments `/* ... */` with the same text also work. Reason is the text after `--`, trimmed; if missing, emit the suppression with `reason: ''` (core treats it as not suppressed; the CLI reports it).
- Parse with `ts.createSourceFile` using ScriptKind by extension (TSX for .tsx/.jsx and .js — use JSX-enabled kinds for .js too). Parse errors in a file are tolerated (TS parser is error-recovering); unreadable files go to `errors`.

## Addendum (post-wave-1)

```ts
export function isIgnoredPath(config: Pick<LegacyConfig, 'ignore'>, filePath: string, extra?: readonly string[]): boolean; // picomatch, dot: true, over config.ignore + extra
```
`collectSites` does NOT apply `config.ignore`; callers that don't go through the scanner (the ESLint plugin) must call `isIgnoredPath` themselves.
