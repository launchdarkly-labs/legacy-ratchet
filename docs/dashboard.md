# Reports and dashboard

`migration-tracker report` answers "is the migration actually shrinking, and where is the rest?" It scans the repository and builds a snapshot of every legacy import site, grouped by policy group.

## Generating a report

```sh
migration-tracker report --format html
```

writes `migration-report.html` in the current directory. Use `--output <file>` to choose another path.

```sh
migration-tracker report --format json
```

prints the snapshot as JSON to stdout, or to `--output <file>`.

`report` counts every site, whatever its mode, including suppressed and excepted sites. It does not need a baseline.

### Report options

| Option | Description |
|---|---|
| `--format <html\|json>` | Output format. Default `html`. |
| `--output <file>` | Where to write. Default `migration-report.html` for HTML, stdout for JSON. |
| `--append-history` | Append one entry to the history file. |
| `--history <path>` | History file to read and append to, relative to the current directory. Default `<root>/.migrations/history.jsonl`. |
| `--source-url <template>` | Link template for sites, stored in the snapshot. `{sha}` is replaced with the report's commit (or `HEAD`), `{path}` with the file path and `{line}` with the line. For example `https://example.com/acme/repo/blob/{sha}/{path}#L{line}`. |
| `--codeowners <path>` | CODEOWNERS file to read, relative to the current directory. A missing file is an error. |
| `--no-codeowners` | Don't read a CODEOWNERS file. |

Without `--codeowners`, the report looks for `.github/CODEOWNERS`, `CODEOWNERS` and `docs/CODEOWNERS` under `--root`, in that order, and uses the first one it finds. If there is none, sites have no owners. Rules follow GitHub's semantics: the last matching rule wins, and a rule with no owners clears ownership for the files it matches. Patterns are matched against paths relative to `--root`, so when `--root` is a subdirectory of the repository, point `--codeowners` at a file whose patterns are relative to that directory, or use `--no-codeowners`.

The engine options of `check` (`--engine`, `--depcruise-config`, `--ts-config`, `--cache`, `--no-prefilter`) work the same way. For `report`, the prefilter also keeps files that mention a `new` package, so adoption is counted.

## Numbers

Each group in the report has these numbers. The summary shows the same numbers across all groups.

- **Sites**: legacy import sites left. One site is every import of one package specifier in one file with the same module system.
- **Start**: the number of sites the migration started with. It is the group's `start` from `migrations.json` if set, otherwise the group's count in the earliest history entry, otherwise the current count. It is never lower than the current count. The summary adds up the groups.
- **% complete**: the share of the starting sites that are gone, `(start - sites) / start`, to one decimal. A group that started at 0 is 100% complete.
- **New sites**: imports of the group's `new` packages, counted once per file and package. The same matching rules as `old` apply. A package listed as `new` in several groups counts for each.
- **Adoption**: new sites as a share of new plus legacy sites, to one decimal. It is empty when a group has neither.
- **By owner**: legacy sites per owner, from CODEOWNERS. A site with several owners counts once for each. Sites that no rule covers count under the group's `owner`, or "Unowned".
- **By directory**: legacy sites per directory, using the first two parts of the path (`packages/ui`). Files one level deep use their directory (`src`), and files at the root use `.`.
- **Start here**: up to 10 files with the fewest legacy sites in the group, the quickest to finish.

## The HTML dashboard

The HTML file is a single self-contained page with no external requests, so you can upload it as a CI artifact, attach it to a ticket, or publish it on a static site. It has three levels, each one click deeper:

- **Overview**: the headline "% migrated" (adoption across groups that list replacements, otherwise % complete), legacy imports left, and imports already on replacements. Below it, one row per group with a progress bar, imports left, and owner, least progress first.
- **Group**: progress, breakdowns by team (CODEOWNERS), directory, and package (click a bar to filter the files), the "Start here" list, and every file with legacy imports.
- **File**: each import site with its line, kind, owners, suppression reason, a "View on source" link when the report was built with `--source-url`, and the replacement and migration guide.

The view is kept in the URL hash (`#group=<id>&file=<path>`), so a link opens the same view.

Counts are of file-level sites: all imports of one package specifier in a file with the same module system are one site (see [ratcheting.md](ratcheting.md#import-site-identity)). Kind chips list the syntax forms a site merges: `import`, `import()`, `export from`, `require()`, `import =`.

The snapshot is embedded in the page in a `<script id="migration-tracker-data" type="application/json">` element. Tools can read it back out without parsing the HTML layout.

## History file

`--append-history` appends one line to `.migrations/history.jsonl` (or the `--history` file) with the time, git commit and branch (when available), the site total for each group (`totals`), and the new-package total for each group (`newTotals`). The report uses the earliest entry for a group as its starting count for "% complete" when `start` isn't set in `migrations.json`. Blank and malformed lines are skipped.

## JSON snapshot

`--format json` emits a `ReportSnapshot`:

| Field | Description |
|---|---|
| `schemaVersion` | `2` |
| `generatedAt` | ISO timestamp |
| `revision` | `{ commit, branch }` when run inside git |
| `totalSites` | All legacy sites |
| `groups` | One entry per group in config order, including groups with zero sites: `id`, `description`, `owner`, `docs`, `mode`, `old`, `new`, `sites`, `files`, `byPackage`, `topFiles`, `start`, `completePct`, `newSites`, `adoptionPct`, `byOwner`, `byDirectory`, `startHere` |
| `totals` | `sites`, `start`, `completePct`, `newSites` and `adoptionPct` across all groups |
| `sites` | Every import site: `id`, `groupId`, `filePath`, `packageName`, `moduleSpecifier`, `importKind` (module system), `kinds` (syntax forms), `typeOnly`, `sourceFingerprint`, and `occurrences`, `line`, `column`, `suppression` and `owners` when present |
| `history` | Entries read from the history file, each with `identityVersion: 2` if written by a current version |
| `sourceUrlTemplate` | The `--source-url` template, when given |

`topFiles` lists the files with the most sites in each group, sorted by count and then path, up to 10. See [Numbers](#numbers) for the other fields. `adoptionPct` is `null` when a group has no new or legacy sites.

The dashboard also loads `schemaVersion: 1` snapshots. Their sites keep their old ids and are shown one row per import statement.
