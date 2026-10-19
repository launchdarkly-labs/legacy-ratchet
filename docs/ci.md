# CI

`migration-tracker check` is the command CI runs. It scans the repository, compares the import sites with `.migrations/baseline.json`, and exits non-zero when policy is violated.

## GitHub Action

This repository ships a composite action (`action.yml` at the repository root):

```yaml
name: migration-tracker

on:
  pull_request:

permissions:
  contents: read

jobs:
  migration-tracker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: <owner>/migration-tracker@<commit-sha>
```

The action builds the CLI from its own checkout (`pnpm install --frozen-lockfile && pnpm build`, about a minute), then runs:

```sh
node <action>/packages/cli/dist/bin.js check --format github --base <base-ref>
```

and fails the step when the CLI exits non-zero. Pin `uses:` to a commit SHA and bump it to upgrade.

**Base commit.** `--base` reads the baseline at the base commit with `git show`. If that commit is missing from a shallow checkout, the action fetches it (`git fetch --depth=1 origin <base-ref>`). `--changed-since` diffs against a ref, so if you pass it through `args`, check out with `fetch-depth: 0`.

### Inputs

| Input | Default | Description |
|---|---|---|
| `working-directory` | `.` | Directory containing `migrations.json` and `.migrations/`. |
| `base-ref` | `${{ github.event.pull_request.base.sha }}` | Ref passed to `--base`. On events without a pull request it is empty, and the action skips baseline verification with a notice. |
| `args` | | Extra arguments appended to `migration-tracker check`, split on whitespace. For example `--changed-since origin/main`. |
| `report-path` | | When set, also writes the HTML dashboard to this path (relative to `working-directory`) with `migration-tracker report --format html`, even when the check fails. Upload it with `actions/upload-artifact` or publish it to static hosting. |
| `report-args` | | Extra arguments appended to `migration-tracker report`, split on whitespace. Only used when `report-path` is set. For example `--source-url https://example.com/acme/blob/{sha}/{path}#L{line}`. See [dashboard.md](dashboard.md#report-options). |

To try it locally against the example app, build the CLI and run `node packages/cli/dist/bin.js check --root examples/vite-react --format github`.

## Other CI systems

Run the CLI directly. Check out enough history to resolve the base ref.

```sh
node path/to/migration-tracker/packages/cli/dist/bin.js check --base origin/main
```

`--base <ref>` makes `check` also verify that the baseline has no ids that were not in the baseline at `<ref>`, the same as `migration-tracker baseline verify --base <ref>`. See [ratcheting.md](ratcheting.md#baseline-safety).

`--changed-since <ref>` scans only files changed between `<ref>` and `HEAD` (added, copied, modified or renamed, from `git diff --name-only --diff-filter=ACMR <ref>...HEAD`), plus untracked files. It is faster on large repositories. Retired sites are then only computed for the scanned files, so run a full check on your main branch.

## Import extraction engine in CI

`migration-tracker check` uses [dependency-cruiser](depcruise.md) by default. In CI:

- **Install dependencies first.** Matching never needs `node_modules`, but dependency-cruiser classifies some imports differently when packages cannot be resolved (see [ratcheting.md](ratcheting.md#known-limitations)).
- **Pass resolve settings explicitly.** The CLI does not read `.dependency-cruiser.js` on its own. Use `--depcruise-config .dependency-cruiser.js` (or `MIGRATION_TRACKER_DEPCRUISE_CONFIG`) and `--ts-config tsconfig.json` if you want aliases resolved. Ids are the same either way.
- **The cache is usually unnecessary.** The prefilter only hands dependency-cruiser the files that mention an `old` package, so runs stay short. If you do enable `--cache`, run from the repository root (the cache is disabled otherwise) and persist `.cache/migration-tracker/depcruise` with your CI cache action.
- **Fall back if needed.** If dependency-cruiser cannot handle a file, the check exits 2 and names it. Add an `ignore` glob, or set `MIGRATION_TRACKER_ENGINE=scanner` for the job while you sort it out.

If your CI already runs dependency-cruiser, you can run migration-tracker as a [reporter plugin](depcruise.md#mode-2-reporter-plugin) inside that run instead of calling `migration-tracker check`. The plugin does not support `--base` or `--changed-since`, so keep `migration-tracker baseline verify --base <ref>` as a separate step.

## Rolling out file-level ids

Baselines from earlier versions have `schemaVersion: 1`. They keep working, with a warning, until you migrate them:

1. Upgrade the CLI and run `migration-tracker baseline migrate` on a branch.
2. Commit `.migrations/baseline.json` in a pull request on its own. Its `--base` check passes even though the base branch still has the version 1 file.
3. Update any tooling that reads JSON output: `schemaVersion` is now `2`, site ids have four parts, and `line` and `column` can be missing.

The site count usually drops in that pull request because repeated imports in a file merge into one site. See [ratcheting.md](ratcheting.md#migrating-a-schemaversion-1-baseline).

## Global options

Every command accepts:

| Option | Default | Description |
|---|---|---|
| `--root <dir>` | current directory | Repository root. All file paths are relative to it. |
| `--config <path>` | `<root>/migrations.json` | Config file location. |
| `--no-color` | | Disable colored output. |
| `--quiet` | | Reduce output. |

Set `MIGRATION_TRACKER_DEBUG=1` to print stack traces for runtime errors.

## Output formats

`migration-tracker check --format <format>`, optionally with `--output <file>` to write to a file instead of stdout.

### `text` (default)

One block per violation, then expired exceptions, then suppressions with no reason (as warnings), then a summary line:

```
✖ forms: src/features/checkout/PaymentForm.tsx:8
  New import of "redux-form" is not allowed.
  Preferred replacement: "react-hook-form"
  Migration guide: https://engineering.example.com/migrations/forms

Legacy sites: 108 remaining | 12 retired | 1 new violation
```

`✖` marks severity `error` and `⚠` marks `warn`. A group with several replacements prints `Preferred replacements: "a", "b"`. The replacement line is omitted when `new` is empty and the guide line when the group has no `docs`.

### `github`

Emits a workflow command per violation, so GitHub shows it inline on the pull request diff:

```
::error file=src/features/checkout/PaymentForm.tsx,line=8,col=27,title=migration-tracker/forms::New import of "redux-form" is not allowed. Preferred replacement: "react-hook-form"
```

`warn` violations use `::warning`. If `$GITHUB_STEP_SUMMARY` is set, the `markdown` summary is also appended to it, so it appears on the workflow run's summary page.

### `markdown`

A summary for a pull request comment or job summary: a table per group with remaining, retired and new counts, a list of violations with `file:line` links using relative paths, the retired count, and, when there are retired sites, a tip to run `migration-tracker baseline update`.

The action does not post pull request comments itself. To post one, run `migration-tracker check --format markdown --output migration-tracker.md` and pass the file to a comment action of your choice.

### `json`

Machine-readable, with a stable key order:

```json
{
  "schemaVersion": 2,
  "failed": true,
  "groups": [{ "groupId": "forms", "mode": "ratchet", "remaining": 108, "retired": 12, "newSites": 1 }],
  "violations": [
    {
      "groupId": "forms",
      "filePath": "src/features/checkout/PaymentForm.tsx",
      "line": 8,
      "column": 27,
      "moduleSpecifier": "redux-form",
      "importKind": "import",
      "kinds": ["dynamic-import", "import"],
      "occurrences": 2,
      "reason": "new-site",
      "severity": "error",
      "message": "New import of \"redux-form\" is not allowed.",
      "replacements": ["react-hook-form"],
      "docs": "https://engineering.example.com/migrations/forms"
    }
  ],
  "retired": ["forms|src/old/Legacy.tsx|import|redux-form"],
  "expiredExceptions": [],
  "suppressedCount": 0,
  "exceptedCount": 0
}
```

`importKind` is the module system (`import` or `require`) and `kinds` lists the syntax forms the site merges (`import`, `export-from`, `dynamic-import`, `require`, `import-equals`). `line`, `column` and `occurrences` are left out when they are unknown, for example for a site the scanner could not locate. `migration-tracker scan --format json` uses the same site shape, also with `schemaVersion: 2`.

## Exit codes

All commands use the same exit codes:

| Code | Meaning |
|---|---|
| `0` | Success. No failing violations. |
| `1` | Policy failure: a new or banned import with severity `error`, an expired exception, or (with `--base`) baseline entries added since the base ref. |
| `2` | Invalid `migrations.json`, a missing baseline where one is required, an unknown `--engine`, a dependency-cruiser run that failed on a file, or a runtime error. Errors print a single line to stderr, plus detail lines where there are any. |

`migration-tracker check` without a baseline exits 2 if any group uses `ratchet`, with a hint to run `migration-tracker baseline create`. If every group is `report` or `ban`, no baseline is needed.
