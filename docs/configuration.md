# Configuration: `legacy.json`

`legacy.json` lives at the repository root (the directory passed as `--root`, default the current directory). Use `--config <path>` to load it from somewhere else. Run `legacy validate` after editing it.

In the MVP there is one policy per repository. In a monorepo, a single root `legacy.json` covers every package, and all paths are relative to that root. See [examples/pnpm-monorepo](../examples/pnpm-monorepo).

## Full example

```json
{
  "$schema": "./node_modules/@legacy-ratchet/core/schema.json",
  "version": 1,
  "groups": {
    "forms": {
      "description": "Form state moves from redux-form to react-hook-form.",
      "owner": "@acme/web-platform",
      "old": ["redux-form"],
      "new": ["react-hook-form"],
      "enforcement": { "mode": "ratchet", "scope": "imports", "severity": "error" },
      "docs": "https://engineering.example.com/migrations/forms"
    },
    "http": {
      "old": ["request", "axios"],
      "new": ["ky"]
    }
  },
  "ignore": ["**/__generated__/**"],
  "exceptions": [
    {
      "groupId": "forms",
      "files": ["src/legacy/**"],
      "reason": "Frozen checkout, deleted at the new checkout launch.",
      "owner": "@acme/checkout",
      "issue": "https://github.com/acme/web/issues/1234",
      "expires": "2026-12-31"
    }
  ]
}
```

## Top-level fields

| Field | Required | Default | Description |
|---|---|---|---|
| `$schema` | no | | Path or URL of the JSON schema, for editor completion. `legacy init` sets `./node_modules/@legacy-ratchet/core/schema.json`. Ignored by validation. |
| `version` | yes | | Must be `1`. |
| `groups` | yes | | Object of group id to group policy. At least one group. |
| `ignore` | no | `[]` | Extra glob patterns of files to skip, relative to the root. |
| `exceptions` | no | `[]` | Dated, file-scoped exceptions. See below. |

Unknown keys are errors, at the top level and inside groups, exceptions, and `enforcement`.

## Groups

A group is one migration: a set of deprecated packages and what replaces them. The key is the group id. Group ids must match `^[a-z0-9][a-z0-9_-]*$`: lowercase letters, digits, `-` and `_`, not starting with `-` or `_`. Group ids appear in output, in baseline entries, and in suppression comments, so renaming a group invalidates its baseline entries.

| Field | Required | Default | Description |
|---|---|---|---|
| `old` | yes | | Non-empty array of package names being retired. |
| `new` | no | `[]` | Package names that replace them. Shown as "Preferred replacement" in violations. May be empty. |
| `enforcement` | no | `{ "mode": "report", "scope": "imports", "severity": "error" }` | How sites in this group are treated. Each field is defaulted on its own, so `{ "mode": "ratchet" }` is enough. |
| `docs` | no | | URL of a migration guide. Must be a valid URL. Shown as "Migration guide" in violations. |
| `description` | no | | Free text shown in reports. |
| `owner` | no | | Team or person responsible for the migration. Shown in the dashboard's ownership view, and used for sites that no CODEOWNERS rule covers. |
| `start` | no | | Integer, at least 0. The number of sites the migration started with, used as the baseline for "% complete". Without it, the report uses the group's count in the earliest history entry, or the current count. See [dashboard.md](dashboard.md#numbers). |

### Package names

Entries in `old` and `new` must be valid npm package names: `name` or `@scope/name`. Subpaths such as `lodash/fp` are not allowed in the config. List the package, and every subpath import of it will match.

### Enforcement

| Field | Values | Default |
|---|---|---|
| `mode` | `report`, `ratchet`, `ban` | `report` |
| `scope` | `imports` | `imports` (the only value in the MVP) |
| `severity` | `error`, `warn` | `error` |

Modes:

- **`report`**: sites are counted in `scan`, `check` summaries, and reports, but never fail a check. Use it to measure before you enforce.
- **`ratchet`**: sites listed in `.legacy/baseline.json` pass. Any site not in the baseline is a violation (`New import of "<specifier>" is not allowed.`). If `.legacy/baseline.json` is missing and any group uses `ratchet`, `legacy check` exits 2 with a hint to run `legacy baseline create`.
- **`ban`**: every site is a violation, whether or not it is in the baseline (`Import of "<specifier>" is banned.`). Use it once a package is gone, to keep it gone, or with exceptions for the last few holdouts.

Severity decides whether a violation fails the check. `error` violations make `legacy check` exit 1 and print `✖`. `warn` violations are printed with `⚠` and emitted as `::warning` annotations in GitHub format, but do not fail the check. In ESLint, severity comes from your ESLint config instead.

## Matching rules

A module specifier matches a package `p` when it is exactly `p` or starts with `p/`:

| Specifier | `redux-form` in `old` |
|---|---|
| `redux-form` | matches |
| `redux-form/lib/Field` | matches (subpath) |
| `redux-form-extra` | does not match (prefixes are not matched) |
| `@company/legacy-forms/field` | matches `@company/legacy-forms` |

- Scoped packages work the same way: `@company/legacy-forms/field` matches `@company/legacy-forms`.
- Relative (`./x`, `../x`), absolute (`/x`), package-internal (`#x`), `node:`, `bun:` and URL specifiers never match. dependency-cruiser strips the `node:` and `bun:` prefixes, so legacy-ratchet puts them back before matching: `node:fs` never matches a group that lists `fs`, whichever engine runs.
- If several entries match, the longest one wins.
- Specifiers are matched as written. dependency-cruiser may resolve path aliases, `tsconfig` `paths` and bundler aliases, but the resolved path is never used for matching. See [ratcheting.md](ratcheting.md#known-limitations).

Every import form counts, including type-only imports: `import`, `import type`, `import x = require()`, `export ... from`, `export type ... from`, `require('m')`, and `import('m')` with a string literal. All imports of one specifier in a file with the same module system form a single site; see [ratcheting.md](ratcheting.md#import-site-identity). `require.resolve`, `jest.mock` and `vi.mock` are not counted, and neither are dynamic specifiers built at runtime.

## Conflicts

`legacy validate` reports these as errors, with a path such as `groups.forms.old[1]`:

- The same package in `old` of two groups.
- A package in some group's `old` and some group's `new` (the same group or another one).
- A duplicate entry within one `old` or `new` array.

## Ignore

Files are scanned if they have one of these extensions: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`. These globs are always ignored:

```
**/node_modules/**  **/dist/**  **/build/**  **/coverage/**  **/.git/**
**/*.d.ts  **/.next/**  **/out/**
```

Dotfiles and dot-directories are not scanned. `ignore` adds globs on top of the defaults, and `--ignore <glob>` on `legacy scan` adds more for a single run. Globs are relative to the root.

## Import extraction engine

By default the CLI uses [dependency-cruiser](depcruise.md) to find imports, and its own TypeScript-based scanner only to add line numbers and read suppression comments in the files that have legacy imports. `--engine scanner` uses the scanner for everything. Both produce the same site ids; the differences are listed in [ratcheting.md](ratcheting.md#known-limitations).

These options apply to `scan`, `check`, `baseline create`, `baseline update`, `baseline migrate` and `report`. Put them after the subcommand: `legacy check --engine scanner`.

| Option | Env variable | Default | Description |
|---|---|---|---|
| `--engine <depcruise\|scanner>` | `LEGACY_RATCHET_ENGINE` | `depcruise` | Import extraction engine. The flag wins over the variable. Any other value exits 2. |
| `--depcruise-config <path>` | `LEGACY_RATCHET_DEPCRUISE_CONFIG` | none | A dependency-cruiser config to take resolve options from, relative to the current directory. The CLI does not read `.dependency-cruiser.js` on its own. |
| `--ts-config <path>` | | none | A tsconfig, relative to the current directory, for resolving `paths`. Without it, `options.tsConfig` from `--depcruise-config` is used if set. |
| `--cache [dir]` / `--no-cache` | | off | dependency-cruiser's content cache. `--cache` alone uses `<root>/.cache/legacy-ratchet/depcruise`. The cache is disabled with a warning unless the current directory is the root. |
| `--no-prefilter` | | prefilter on | By default only files whose text contains one of the `old` package names are passed to dependency-cruiser. This flag passes every listed file. |

From a `--depcruise-config` file the CLI keeps only what affects resolution: `exclude`, `tsConfig`, `enhancedResolveOptions`, `externalModuleResolutionStrategy`, `preserveSymlinks`, `combinedDependencies`, `builtInModules` and `parser`. It always sets `tsPreCompilationDeps: true`, so type-only imports are found. Some settings would hide imports, so it overrides them and prints a warning:

- `includeOnly`, `focus`, `reaches`, `collapse` and `affected` are ignored, because every import of every file is needed.
- An `exclude.path` that matches a path under `node_modules` is applied to local files only. dependency-cruiser matches `exclude` against resolved paths, so excluding `node_modules` would drop every import of an installed package.
- `exclude.dynamic` is ignored, because `import()` calls are legacy imports too.
- `webpackConfig` and `babelConfig` are ignored.

Other warnings: dependency-cruiser cannot load `typescript` (type-only and `import x = require()` detection is degraded; see [depcruise.md](depcruise.md#typescript-must-be-resolvable)), and the cache was disabled. Warnings go to stderr, and `--quiet` hides them.

dependency-cruiser stops the whole run when it cannot read or parse one file. The CLI then exits 2 with `error: dependency-cruiser could not extract imports, so nothing was checked` and names the file. Add an `ignore` glob for the file or use `--engine scanner`.

Baselines record which engine wrote them in `scannerVersion`, for example `0.2.0+dependency-cruiser@17.4.3`. Ids do not depend on the engine, so you can switch engines without touching the baseline.

## Exceptions

An exception lets sites of one group in specific files pass, until a date.

| Field | Required | Description |
|---|---|---|
| `groupId` | yes | An existing group id. |
| `files` | yes | Non-empty array of globs, relative to the root. Matching includes dotfiles. |
| `reason` | yes | Why the exception exists. Must not be blank. |
| `owner` | yes | Who is accountable for removing it. Must not be blank. |
| `issue` | no | Link or ticket id for the follow-up work. |
| `expires` | yes | Date in `YYYY-MM-DD` format. Must be a real calendar date. |

Excepted sites never violate, in any mode, including `ban`. An exception is still valid on its expiry date and expires the day after (UTC). Once expired, it stops excusing sites, and its mere presence makes `legacy check` fail with exit 1 until someone removes or renews it. See [exceptions.md](exceptions.md).

## Inline suppressions

For a single import, put a comment on the line directly above the import statement:

```ts
// legacy-ratchet-disable-next-line dates -- fiscal-week math needs moment's isoWeek until DATA-142
import moment from 'moment';
```

Or at the end of the same line:

```ts
const request = require('request'); // legacy-ratchet-disable-line http -- one-off fixture script
```

Syntax: `legacy-ratchet-disable-next-line [groupId[,groupId...]] -- reason` or `legacy-ratchet-disable-line [groupIds] -- reason`.

- Group ids are optional. Without them, the suppression applies to every group. List several with commas.
- The reason after `--` is required. A suppression without a reason does not suppress anything, and `legacy check` prints it as a warning.
- Block comments (`/* ... */`) with the same text work too.

A site is suppressed only when every import of it in the file is suppressed. See [exceptions.md](exceptions.md#suppressions-on-file-level-sites).

Suppressed sites never violate, but they are still legacy usage and are still found by `legacy scan`.
