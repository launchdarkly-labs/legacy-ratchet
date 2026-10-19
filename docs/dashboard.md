# Reports and dashboard

`legacy report` answers "is the migration actually shrinking, and where is the rest?" It scans the repository and builds a snapshot of every legacy import site, grouped by policy group.

## Generating a report

```sh
legacy report --format html
```

writes `legacy-report.html` in the current directory. Use `--output <file>` to choose another path.

```sh
legacy report --format json
```

prints the snapshot as JSON to stdout, or to `--output <file>`.

`report` counts every site, whatever its mode, including suppressed and excepted sites. It does not need a baseline.

## The HTML dashboard

The HTML file is a single self-contained page with no external requests, so you can upload it as a CI artifact, attach it to a ticket, or publish it on a static site. It shows:

- **Summary**: total legacy sites, the number of files containing them, and the change since the previous history entry.
- **Groups**: one row per group with its mode, old and new packages, remaining sites, and a trend.
- **Trend**: sites over time, from history.
- **Ownership**: remaining sites by group `owner`.
- **Group detail**: per-package counts, the files with the most sites, and the individual sites.

Counts are of file-level sites: all imports of one package specifier in a file with the same module system are one site (see [ratcheting.md](ratcheting.md#import-site-identity)). In the site table:

- **Kind** shows the module system, "ES import" or "require". When a site merges more than one syntax form, or a form other than its plain one, chips list them: `import`, `import()`, `export from`, `require()`, `import =`. The Kind filter filters by module system.
- **Location** shows `file:line` when the line is known and just the file when it is not. A site with several imports in the file shows `×N`.

The snapshot is embedded in the page in a `<script id="legacy-ratchet-data" type="application/json">` element. Tools can read it back out without parsing the HTML layout.

## History and trends

A single report is a point in time. To get a trend, record each run:

```sh
legacy report --format html --append-history
```

`--append-history` appends one line to `.legacy/history.jsonl` with the time, git commit and branch (when available), the site total for each group, and `identityVersion: 2`. Every report reads that file and plots it. Blank lines are skipped, and malformed lines are skipped with a warning.

Entries written before file-level ids have no `identityVersion` and counted every import statement. Their totals are usually higher, so the trend drops at the switch without any migration work. The chart marks the first `identityVersion: 2` point that follows older entries with a dashed line labelled "Counting changed", and a note under the chart gives the date. You don't need to rewrite old history.

Append history from one place only, usually your main branch, so the trend reflects merged code:

```yaml
name: legacy-ratchet report

on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node path/to/legacy-ratchet/packages/cli/dist/bin.js report --format html --append-history
      - uses: actions/upload-artifact@v4
        with:
          name: legacy-report
          path: legacy-report.html
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add .legacy/history.jsonl
          git commit -m "Record legacy-ratchet history" || exit 0
          git push
```

## JSON snapshot

`--format json` emits a `ReportSnapshot`:

| Field | Description |
|---|---|
| `schemaVersion` | `2` |
| `generatedAt` | ISO timestamp |
| `revision` | `{ commit, branch }` when run inside git |
| `totalSites` | All legacy sites |
| `groups` | One entry per group in config order, including groups with zero sites: `id`, `description`, `owner`, `docs`, `mode`, `old`, `new`, `sites`, `files`, `byPackage`, `topFiles` |
| `sites` | Every import site: `id`, `groupId`, `filePath`, `packageName`, `moduleSpecifier`, `importKind` (module system), `kinds` (syntax forms), `typeOnly`, `sourceFingerprint`, and `occurrences`, `line`, `column` and `suppression` when present |
| `history` | Entries read from `.legacy/history.jsonl`, each with `identityVersion: 2` if written by a current version |

`topFiles` lists the files with the most sites in each group, sorted by count and then path, up to 10.

The dashboard also loads `schemaVersion: 1` snapshots. Their sites keep their old ids and are shown one row per import statement.
