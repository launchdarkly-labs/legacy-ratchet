# Progress reporting contract

Adds migration progress, adoption, and per-file ownership to the report. All new fields are optional or additive, and `ReportSnapshot.schemaVersion` stays `2`. The dashboard must keep rendering snapshots that lack these fields.

## Config (`legacy.json`, per group, optional)

```ts
interface GroupPolicy {
  // existing fields…
  start?: number;   // explicit starting site count for "% complete"; overrides history
}
```

Validation: `start` must be an integer of at least 0. Regenerate `schema.json`.

## Types (`packages/core/src/types.ts`)

```ts
interface ImportSite {
  // existing fields…
  owners?: string[]; // CODEOWNERS owners for filePath (last matching rule); absent when no CODEOWNERS file or no rule matches
}

interface AdoptionCount {
  groupId: string;
  filePath: string;
  packageName: string; // the matched `new` package
}

interface GroupReport {
  // existing fields…
  start: number;                        // "% complete" denominator (see below)
  completePct: number;                  // 0–100, one decimal
  newSites: number;                     // import sites of the group's `new` packages (file × package)
  adoptionPct: number | null;           // newSites / (newSites + sites) × 100, one decimal; null when both are 0
  byOwner: Record<string, number>;      // remaining sites per CODEOWNERS owner; sites with no owner count under the group's `owner`, or 'Unowned'
  byDirectory: Record<string, number>;  // remaining sites per directory = first two path segments ('apps/web', 'packages/ui'); files at depth one use their first segment; root files use '.'
  startHere: Array<{ filePath: string; count: number }>; // up to 10 files with the fewest sites in this group, ascending count then path
}

interface ReportTotals {
  sites: number;              // equals totalSites
  start: number;              // sum of group starts
  completePct: number;
  newSites: number;
  adoptionPct: number | null;
}

interface HistoryEntry {
  // existing fields…
  newTotals?: Record<string, number>; // newSites per group
}

interface ReportSnapshot {
  // existing fields…
  totals?: ReportTotals;          // always set by buildReport; optional only for old snapshots
  sourceUrlTemplate?: string;     // e.g. 'https://example.com/{repo}/blob/{sha}/{path}#L{line}' with {sha}, {path}, {line}
}
```

`byOwner` and `byDirectory` keys are sorted. A site with several owners counts once for each owner.

## core exports (additions)

```ts
export function collectAdoption(config: LegacyConfig, raw: readonly RawImport[]): AdoptionCount[]; // sorted by groupId, filePath, packageName
export function newPackages(config: LegacyConfig): string[];          // sorted unique `new` packages of all groups
export interface CodeownersRule { pattern: string; owners: string[]; line: number }
export const CODEOWNERS_LOCATIONS: readonly string[];                 // ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']
export function parseCodeowners(text: string): CodeownersRule[];
export function ownersFor(rules: readonly CodeownersRule[], filePath: string): string[] | undefined;
export function codeownersPatternRegex(pattern: string): RegExp;
export function assignOwners(sites: readonly ImportSite[], rules: readonly CodeownersRule[]): ImportSite[]; // sets or clears `owners`
export interface BuildReportOptions { history?; revision?; now?; topFiles?; adoption?: readonly AdoptionCount[]; sourceUrlTemplate?: string }
export function buildReport(config: LegacyConfig, sites: readonly ImportSite[], opts?: BuildReportOptions): ReportSnapshot;
```

## Semantics

- **Start:** `group.start` if set in config, else the group's total in the **earliest** history entry that has that group, else the current count. Then `start = max(start, current)`, so progress is never negative.
- **completePct:** `start === 0 ? 100 : round1((start - current) / start × 100)`.
- **Adoption:** core matches imports of each group's `new` packages with the same rules as `old` (exact name or subpath, no prefixes, longest match). A new-package site is unique per `(groupId, filePath, packageName)`. The same package may appear in the `new` list of several groups and counts for each. A package in a group's `old` list never counts as new. Without `opts.adoption`, `newSites` is 0.
- **CODEOWNERS:**
  - Looked up in the repository root at `.github/CODEOWNERS`, then `CODEOWNERS`, then `docs/CODEOWNERS`.
  - GitHub semantics: the last matching rule wins. Patterns are gitignore-style: a leading `/` anchors to the root, a trailing `/` matches a directory, `*` doesn't cross `/`, `**` does, and a pattern without `/` matches at any depth. A pattern ending in `/*` matches direct children only. Inline comments are stripped. A rule with no owners un-assigns.
  - Implement this in the CLI (filesystem) with the matcher as a pure, tested function in core: `parseCodeowners(text) -> rules`, `ownersFor(rules, path)`.
- **Source links:** the CLI's `report --source-url <template>` stores the template in the snapshot. The dashboard fills in `{sha}` from `revision.commit` (falling back to `HEAD`), plus `{path}` and `{line}`.

## CLI

- `report`:
  - Gains `--source-url <template>`, `--codeowners <path>` (default: auto-detect under `--root`; an explicit missing path exits 2), and `--no-codeowners`.
  - `--history <path>` overrides `.legacy/history.jsonl` for both reading and `--append-history`.
  - The depcruise prefilter for `report` includes every `new` package as well as `old`, so adoption isn't undercounted (`scanProject(..., { adoption: true })`). `check`, `scan` and `baseline` keep the `old`-only prefilter.
- The depcruise reporter plugin's `LEGACY_RATCHET_REPORT` snapshot also counts adoption and auto-detects CODEOWNERS.
- `historyEntry()` includes `newTotals`.
- `check` output is unchanged.

## Action (`action.yml`)

- New input `report-args`: extra arguments for `legacy report`, split on whitespace, used only when `report-path` is set.
