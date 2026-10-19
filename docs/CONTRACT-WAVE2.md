# Wave 2 contract: CLI, ESLint plugin, GitHub integration

Read `docs/CONTRACT.md` first; core and scanner are implemented per that spec.

## CLI (`@migration-tracker/cli`, bin `migration-tracker` and `mt`)

commander-based. `src/bin.ts` (shebang `#!/usr/bin/env node`) calls `run(process.argv)` from `src/index.ts`; `run` returns the exit code and never calls `process.exit` itself (bin does). All commands are also exported as functions taking an options object + an `io` object `{ stdout(s), stderr(s), cwd }` so tests can run in-process.

Global options: `--root <dir>` (default: cwd), `--config <path>` (default `<root>/migrations.json`), `--no-color`, `--quiet`.

Exit codes: `0` success, `1` policy violations / failed check / unauthorized baseline additions, `2` invalid configuration, missing baseline where required, or runtime error. Errors print a single readable line to stderr (stack only with `MIGRATION_TRACKER_DEBUG=1`).

| Command | Behavior |
|---|---|
| `migration-tracker init [--force]` | Writes `migrations.json` (sample with one `report`-mode group, `$schema: "./node_modules/@migration-tracker/core/schema.json"`) and `.migrations/README.md` explaining the workflow. Refuses to overwrite without `--force` (exit 2). Detects packages in root `package.json` deps that are well-known legacy candidates (moment, request, enzyme, redux-form, tslint, node-sass, lodash → hint only) and adds them as commented guidance in stdout, NOT in the file. |
| `migration-tracker validate` | Validates config; prints issues as `path: message`; exit 2 on invalid. |
| `migration-tracker scan [--format text\|json] [--output f] [--ignore glob]... [--changed-since ref]` | Scans, prints sites grouped by group (text) or `{ schemaVersion:2, sites, files, errors }` JSON (each site includes `kinds`, and `occurrences` when known). Text site lines print `import (dynamic-import, import)` when a site merges more than one kind. Exit 0 regardless of sites. |
| `migration-tracker baseline create [--force]` | Full scan → `createBaseline` → writes `.migrations/baseline.json`. Refuses if it exists unless `--force`. |
| `migration-tracker baseline update` | Requires existing baseline (exit 2 otherwise). Full scan → `updateBaseline`; prints removed count. Never adds. |
| `migration-tracker baseline verify --base <ref>` | Loads `<ref>:.migrations/baseline.json` via `git show`; `diffBaselines(base, current)`; any `added` → print them, exit 1. Missing at base ref → ok (first adoption) but prints a notice. |
| `migration-tracker check [--format text\|json\|markdown\|github] [--output f] [--changed-since ref] [--base ref]` | Loads config + baseline (baseline optional — missing baseline with any ratchet group = exit 2 with hint to run `baseline create`, unless every group is report/ban). Full scan (or, with `--changed-since`, scans only files changed vs ref per `git diff --name-only --diff-filter=ACMR <ref>...HEAD` plus untracked, and evaluates only those files; `retired` is then computed only over scanned files). `evaluate`. With `--base`, also runs baseline verify and fails on unauthorized additions. Text output uses `formatViolation` for each violation, then expired exceptions, empty-reason suppressions as warnings, and the summary line `Legacy sites: 108 remaining \| 12 retired \| 1 new violation` (pluralize "violation(s)"). `github` format emits `::error file=…,line=…,col=…,title=migration-tracker/<group>::<message> Preferred replacement: …` annotations (or `::warning`) AND appends the markdown summary to `$GITHUB_STEP_SUMMARY` if set. `markdown` = PR-comment friendly summary: table per group (remaining/retired/new), violations list with file:line links relative paths, retired count, tip to run `migration-tracker baseline update` when retired > 0. `json` = `{ schemaVersion:2, failed, groups, violations:[{groupId,filePath,line?,column?,moduleSpecifier,importKind,kinds,occurrences?,reason,severity,message,replacements,docs}], retired, expiredExceptions, suppressedCount, exceptedCount }` — stable key order. |
| `migration-tracker depcruise-plugin-path` | Prints the absolute path of the built reporter plugin (`dist/depcruise-plugin.js`) for `depcruise --output-type "plugin:<path>"`. Exit 0; warns on stderr if the file is missing. |
| `migration-tracker report [--format html\|json] [--output f] [--append-history]` | Full scan → `buildReport` with history read from `.migrations/history.jsonl` (one `HistoryEntry` per line; tolerate blank lines; skip malformed lines with a warning). `--append-history` appends `historyEntry(report)` to the file. html → `renderHtml` from `@migration-tracker/dashboard`, default output `migration-report.html`; json default stdout. |

### Import extraction engine

`scan`, `check`, `baseline create|update|migrate` and `report` accept:

| Flag | Env fallback | Meaning |
|---|---|---|
| `--engine <depcruise\|scanner>` | `MIGRATION_TRACKER_ENGINE` | Default `depcruise`. Unknown value = exit 2. |
| `--depcruise-config <path>` | `MIGRATION_TRACKER_DEPCRUISE_CONFIG` | dependency-cruiser config to take resolve options from (resolved against cwd). Ignored options are reported as warnings. |
| `--ts-config <path>` | — | tsconfig for path aliases (resolved against cwd). |
| `--cache [dir]` / `--no-cache` | — | depcruise content cache. Off by default; `--cache` uses `<root>/.cache/migration-tracker/depcruise`. Disabled with a warning when cwd is not the root. |
| `--no-prefilter` | — | Pass every listed file to depcruise instead of only files whose text mentions an `old` package. |

depcruise pipeline: `extractWithDepcruise` (with `--changed-since`, only the changed files) → `collectSites` → `scanFilesAt` on files with sites → `enrichSites` for line/column/suppressions/kinds/typeOnly. A site the scanner cannot locate keeps its id and becomes a warning (`position unavailable for <id>; …`). A depcruise run error (it stops the whole run on one bad file) exits 2 with the file named. Engine warnings go to stderr (suppressed by `--quiet`). Baselines record `scannerVersion` as `<scanner>+dependency-cruiser@<version>` for the depcruise engine and the plain scanner version for `--engine scanner`.

### Reporter plugin (`@migration-tracker/cli/depcruise-plugin`)

Synchronous default export `(result: ICruiseResult) => { output, exitCode }`, for use inside the user's own depcruise run. Returns `{ output: '', exitCode: 0 }` for depcruise's validation call (no modules, empty `optionsUsed`) without touching the file system. Config: `MIGRATION_TRACKER_CONFIG` (absolute or relative to cwd; its directory is the root), else walk up from `optionsUsed.baseDir ?? cwd` to `migrations.json`. Exit 2 when: no config, invalid config or baseline, missing baseline with ratchet groups, `tsPreCompilationDeps !== true`, an `exclude` that matches `node_modules/…`, or an `includeOnly` that does not (both drop imports of installed packages). The baseline is restricted to the files the run cruised. `MIGRATION_TRACKER_FORMAT=text|json|markdown|github` (default text; colour on a TTY unless `NO_COLOR`, or forced by `FORCE_COLOR`; github also appends markdown to `GITHUB_STEP_SUMMARY`). `MIGRATION_TRACKER_REPORT=<path>.json|.html` also writes a report snapshot or HTML dashboard (warning line if the dashboard is not built). Exit 1 when the check fails. Never throws.

Revision metadata: `git rev-parse HEAD` and `git rev-parse --abbrev-ref HEAD`, best-effort (absent outside git). Ignore globs = `config.ignore` + `--ignore`. All file paths repo-relative to `--root`.

Tests: integration tests that create temp git repos (`git init`, commits) with fixture sources and run commands in-process via `run([...])`, asserting exit codes and output. Cover the full plan workflow: init → edit → baseline create → add new legacy import → check fails (1) → remove an old import → check passes and reports retired → baseline update removes it → baseline verify vs base ref catches a manually added allowance → exceptions/expiry → changed-since → report html contains data.

## ESLint plugin (`eslint-plugin-migration-tracker`)

ESLint v9+ flat config. Default export plugin object `{ meta: { name, version }, rules: { 'no-legacy-imports': rule }, configs: { recommended } }` where `recommended` is a flat config object `{ name: 'migration-tracker/recommended', plugins: { 'migration-tracker': plugin }, rules: { 'migration-tracker/no-legacy-imports': 'error' } }`.

Rule `no-legacy-imports` options: `[{ configPath?: string; baselinePath?: string; root?: string }]`. Root discovery: `root` option, else walk up from `context.filename` to the nearest dir containing `migrations.json`. Loads and validates config + baseline with core (`parseConfig`, `parseBaseline`), cached by path + mtime. Invalid config → single report on Program node with the validation issues (don't throw). No `migrations.json` found → rule is a no-op.

On `Program:exit`, build `RawImport[]` from ESTree nodes: ImportDeclaration (importKind 'type' → typeOnly; also all specifiers type-only), ExportAllDeclaration / ExportNamedDeclaration with source, TSImportEqualsDeclaration with external module reference, CallExpression `require('lit')` (callee Identifier `require`), ImportExpression with literal / no-substitution template source. Suppression comments per CONTRACT.md (same syntax; use `sourceCode.getCommentsBefore`/all comments by line). filePath = path relative to root. Then `collectSites` + `evaluate(config, sites, baseline)`, and report each violation at the specifier node with messageId `newImport` / `banned`, data `{ specifier, group, replacements, docs }`. Message: `New import of "{{specifier}}" is not allowed ({{group}}).{{replacementText}}{{docsText}}` where replacementText = ` Use "react-hook-form" instead.` (or ` Use "a" or "b" instead.`) and docsText = ` See {{docs}}`. Severity is controlled by ESLint config; `report` mode groups produce nothing. Do not report retired/expired exceptions (that's the CLI's job). Expose `meta.docs.url` pointing to the repo docs.

Note the identity caveat: ESLint sees the working-tree file, so its file-level site ids match the CLI's when the same file is scanned — tests must assert parity with `@migration-tracker/scanner` `scanSource` on a shared fixture. Every unsuppressed occurrence of a violating site is reported.

## GitHub integration

- Root `action.yml` composite action: inputs `working-directory` (default `.`), `base-ref` (default `${{ github.event.pull_request.base.sha }}`), `args`. It builds the CLI from the action checkout with pnpm, fetches `base-ref` if missing, and runs `migration-tracker check --format github --base <base-ref>`; consumers pin `uses:` to a commit SHA.
- `.github/workflows/ci.yml` for this repo: pnpm install, build, typecheck, test on Node 20/22/24.
- `.github/workflows/migration-tracker-example.yml` — example consumer workflow (documented, `workflow_dispatch` only) that runs the local action against `examples/vite-react`.
