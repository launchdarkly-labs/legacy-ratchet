# migration-tracker

Make dependency migrations declarative and enforceable.

`package.json` records which dependencies are installed. It does not record which of them are deprecated, what replaces them, or whether their usage is shrinking. That knowledge lives in wiki pages and Slack threads, and every week someone adds a new `moment` import because the last one they saw was fine.

migration-tracker puts that knowledge in the repository:

1. **Declare** deprecated packages and their replacements in `migrations.json`.
2. **Baseline** the import sites that exist today in `.migrations/baseline.json`.
3. **Enforce** in CI and in the editor: existing sites pass, new ones fail.
4. **Ratchet** the baseline down as legacy imports disappear. It never grows back.
5. **Report** progress per group, per owner, over time.

## Quickstart

```sh
pnpm add -D @migration-tracker/cli
pnpm exec migration-tracker init                 # writes migrations.json and .migrations/README.md
# edit migrations.json: list old packages, their replacements, and a mode
pnpm exec migration-tracker validate
pnpm exec migration-tracker baseline create      # writes .migrations/baseline.json
git add migrations.json .migrations && git commit -m "Adopt migration-tracker"
pnpm exec migration-tracker check                # run this in CI
```

A minimal `migrations.json`:

```json
{
  "$schema": "./node_modules/@migration-tracker/core/schema.json",
  "version": 1,
  "groups": {
    "forms": {
      "old": ["redux-form"],
      "new": ["react-hook-form"],
      "enforcement": { "mode": "ratchet" },
      "docs": "https://engineering.example.com/migrations/forms"
    }
  }
}
```

When a pull request adds a new import, `migration-tracker check` exits 1:

```
✖ forms: src/features/checkout/PaymentForm.tsx:8
  New import of "redux-form" is not allowed.
  Preferred replacement: "react-hook-form"
  Migration guide: https://engineering.example.com/migrations/forms

Legacy sites: 108 remaining | 12 retired | 1 new violation
```

When legacy imports are removed, lock in the progress:

```sh
pnpm exec migration-tracker baseline update
```

On GitHub, use the action. It builds the CLI from its own checkout, so pin it to a commit SHA:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- uses: <owner>/migration-tracker@<commit-sha>
```

## Commands

| Command | What it does |
|---|---|
| `migration-tracker init [--force]` | Write a starter `migrations.json` and `.migrations/README.md`. |
| `migration-tracker validate` | Validate `migrations.json`. |
| `migration-tracker scan` | List current legacy import sites. |
| `migration-tracker baseline create [--force]` | Record current sites in `.migrations/baseline.json`. |
| `migration-tracker baseline update` | Remove sites that no longer exist. Never adds. |
| `migration-tracker baseline migrate` | Rewrite a `schemaVersion: 1` baseline with file-level site ids. |
| `migration-tracker baseline verify --base <ref>` | Fail if the baseline gained entries since `<ref>`. |
| `migration-tracker check` | Fail on new sites in `ratchet` groups and any site in `ban` groups. Formats: `text`, `json`, `markdown`, `github`. |
| `migration-tracker report` | Build an HTML dashboard or JSON snapshot with progress, adoption and ownership, optionally appending to history. See [dashboard.md](docs/dashboard.md#report-options). |
| `migration-tracker depcruise-plugin-path` | Print the absolute path of the dependency-cruiser reporter plugin. |

Exit codes: `0` success, `1` policy failure, `2` invalid configuration, missing baseline, or runtime error. The binary is also available as `migration-tracker`.

## Architecture

```
  imports                          policy                     outputs

  dependency-cruiser ─┐
  (default engine)    │
                      ├──> @migration-tracker/core ──┬──> migration-tracker CLI ──> text / json / markdown / github
  TypeScript scanner ─┘    config, matching,      │         └──────> HTML dashboard (migration-tracker report)
  (positions,              site ids, baselines,   ├──> depcruise reporter plugin (inside your depcruise run)
   suppressions,           evaluation, reports    └──> ESLint rule (imports read from the ESLint AST)
   --engine scanner)
```

dependency-cruiser, through `@migration-tracker/depcruise`, extracts the imports of each file. The scanner adds line numbers and suppression comments for the files that have legacy imports, and can replace dependency-cruiser entirely with `--engine scanner`. Core turns imports into file-level sites (`group|file|kind|specifier`) and compares them with the baseline. The CLI, the reporter plugin and the ESLint rule all compute sites and violations with the same core functions, so they agree on what is new. See [depcruise.md](docs/depcruise.md) and [ratcheting.md](docs/ratcheting.md#import-site-identity).

## Packages

| Package | Description |
|---|---|
| [`@migration-tracker/cli`](packages/cli) | The `migration-tracker` command (alias `mt`). Reads config, scans, writes baselines, checks, reports. Also ships the dependency-cruiser reporter plugin (`@migration-tracker/cli/depcruise-plugin`). |
| [`@migration-tracker/core`](packages/core) | Pure policy logic: config validation, matching, site identity, baselines, evaluation, reports. Ships the `migrations.json` JSON schema. |
| [`@migration-tracker/depcruise`](packages/depcruise) | Runs dependency-cruiser and maps its result to imports. The default import extraction engine. |
| [`@migration-tracker/scanner`](packages/scanner) | Finds imports in JS and TS files with the TypeScript parser. Adds positions and suppressions, and is the `--engine scanner` fallback. |
| [`eslint-plugin-migration-tracker`](packages/eslint-plugin) | ESLint 9 rule `no-legacy-imports` for editor feedback. |
| [`@migration-tracker/dashboard`](packages/dashboard) | The self-contained HTML report. |

## Documentation

- [Getting started](docs/getting-started.md): the full adoption workflow
- [Configuration](docs/configuration.md): every `migrations.json` field, matching rules, modes
- [Ratcheting](docs/ratcheting.md): site identity, baseline safety, migration, known limitations
- [dependency-cruiser](docs/depcruise.md): the default engine and the reporter plugin
- [CI](docs/ci.md): GitHub Action, output formats, exit codes
- [ESLint](docs/eslint.md): editor integration
- [Exceptions](docs/exceptions.md): suppressions, exceptions, expiry, approvals
- [Dashboard](docs/dashboard.md): progress, adoption, and ownership reports

Examples: [examples/vite-react](examples/vite-react) and [examples/pnpm-monorepo](examples/pnpm-monorepo).

## Not in the MVP

- **No codemods.** migration-tracker tells you where legacy imports are and stops new ones. It does not rewrite code.
- **No SaaS.** Everything runs locally and in your CI. State lives in your repository.
- **No runtime tracing.** Usage is measured from static imports, not from what runs in production.
- **No dynamic specifiers.** `require(name)` and `` import(`./${x}`) `` are not detected. Specifiers are matched as written, so an alias that points at a legacy package is not counted.
- **JavaScript and TypeScript only.** One policy per repository.

## Development

Requires Node 20.12 or later (dependency-cruiser supports `^20.12 || ^22 || >=24`) and pnpm (version pinned in `package.json` `packageManager`).

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

To try the CLI against an example after building:

```sh
node packages/cli/dist/bin.js check --root examples/vite-react
```
