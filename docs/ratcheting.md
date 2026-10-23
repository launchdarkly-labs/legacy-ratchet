# Ratcheting and the baseline

A ratchet only turns one way. `.migrations/baseline.json` lists the legacy import sites that existed when you adopted migration-tracker. CI allows those and rejects anything new. As sites disappear, `migration-tracker baseline update` removes them from the list, so the number of allowed sites only goes down.

## Import-site identity

Each site has an id made of four parts joined by `|`:

```
group|file|kind|specifier
```

For example:

```
forms|src/features/checkout/PaymentForm.tsx|import|redux-form
dates|src/features/reports/exportCsv.ts|import|moment
forms|src/legacy/checkout/LegacyAddressForm.tsx|import|redux-form/lib/Field
http|scripts/fetch-fixtures.cjs|require|request
```

| Part | Meaning |
|---|---|
| `group` | The group id from `migrations.json`. |
| `file` | Repository-relative POSIX path (relative to `--root`), with no leading `./`. |
| `kind` | The module system: `import` or `require`. See below. |
| `specifier` | The module specifier exactly as written, including any subpath. |

The kind is the module system, not the syntax:

| Syntax | Kind |
|---|---|
| `import x from 'm'`, `import type`, `import 'm'` | `import` |
| `export ... from 'm'`, `export type ... from 'm'` | `import` |
| `import('m')` | `import` |
| `require('m')` | `require` |
| `import x = require('m')` | `require` |

So a site is file-level: every import of the same specifier with the same module system in one file is one site. The syntax forms a site merges are listed in its `kinds`, and the number of imports in `occurrences`. Both appear in JSON output and the dashboard, and `migration-tracker scan` lists the kinds when there is more than one, but neither is part of the id.

The baseline file stores these ids in a sorted `allowed` array, with `schemaVersion: 2`, a digest of the config, the scanner version (plus the dependency-cruiser version when that engine produced it), the generation time, and the git commit and branch when available.

### Why file-level

[dependency-cruiser](depcruise.md), the default import extraction engine, merges duplicate imports within a file: it keeps one dependency per specifier, module system and type-only flag. It also reports no line or column numbers. An id that counted occurrences, or used the syntax, would depend on which duplicate dependency-cruiser happened to keep. The module system is exactly what it keeps apart, so the CLI engine, the [ESLint rule](eslint.md), the `--engine scanner` fallback and the [reporter plugin](depcruise.md) all compute the same ids.

Line numbers were never part of the id. They change whenever anyone edits the code above an import, which would turn every unrelated edit into a "new" site.

### What counts as new

- A second import of an already-allowed specifier in the same file is not a new site.
- Switching between `import` and `import()`, or adding an `export ... from` of a specifier the file already imports, is not a new site.
- A file that has a baselined site in a group may add other imports of that group without failing. Adding `redux-form/lib/Field` or `require('redux-form')` to a file that is allowed `redux-form` passes, and so does adding `@hookform/resolvers` to a file allowed `react-hook-form` when both are in the same group. The file has to be migrated off the group either way, so these imports add no new migration work. They are still separate sites in reports.
- An import of a different group is still a new site, even in a file that is allowed another group.
- In `ban` groups, `migration-tracker check` reports one violation per site, so per file, specifier and kind, not per import statement. The ESLint rule marks every import of a violating site.

### Suppressions on file-level sites

A site is suppressed only when every one of its imports carries a suppression comment for the group, with a reason. If one import is suppressed and another of the same specifier in the same file is not, the site is not suppressed. Otherwise a single comment would silently cover every future import of that specifier in the file. See [exceptions.md](exceptions.md#suppressions-on-file-level-sites).

### Positions

Line and column are for diagnostics only. Because dependency-cruiser has none, the CLI runs its own TypeScript-based scanner on the files that contain legacy imports and copies the positions, suppressions, `kinds` and type-only flags from it. A site is reported at its first import that is not suppressed, or at its first import if they all are.

When the scanner cannot find a site that dependency-cruiser reported, the site still counts, and `migration-tracker check` prints a warning:

```
⚠ src/types.ts: position unavailable for http|src/types.ts|import|request; depcruise reported it but the scanner did not find it — e.g. typeof import() of an unresolved package
```

Text output then shows the file without a line, and GitHub annotations are file-level.

### Migrating a schemaVersion 1 baseline

Baselines written before file-level ids have `schemaVersion: 1` and five-part ids that end in an occurrence index (`group|file|kind|specifier|0`). They still load: the CLI upgrades them in memory and prints a warning. To rewrite the file, run:

```sh
migration-tracker baseline migrate
git add .migrations/baseline.json
```

`migrate` maps every old id to its new id (dropping the occurrence and mapping the kind, so `dynamic-import` and `export-from` become `import`), then reconciles the result against a fresh scan. That second step handles `import x = require()`, which version 1 counted as `import` and now counts as `require`. It never adds a file and specifier pair that the old baseline did not have. It prints how many sites it mapped, added during reconciliation, and dropped. It exits 2 if there is no baseline or the baseline is already version 2.

`migration-tracker baseline verify --base <ref>` and `migration-tracker check --base <ref>` understand the upgrade, so the pull request that migrates the baseline passes when the base ref still has a version 1 baseline.

Counts usually drop when you migrate, because several imports of one specifier in a file become one site.

## Baseline safety

The baseline is only useful if nobody can quietly add to it. Two mechanisms protect it.

**Updates are monotonic.** `migration-tracker baseline update` keeps the entries in the current baseline that still exist in the code and drops the rest. It never adds an id. It requires an existing baseline and exits 2 without one. It prints how many entries it removed.

**Additions are caught in review.** `migration-tracker baseline verify --base <ref>` loads `.migrations/baseline.json` as it was at `<ref>` (via `git show`) and compares it with the working copy. Any id present now but not at the base is printed, and the command exits 1. If the baseline did not exist at the base ref, it passes with a notice, which covers first adoption.

`migration-tracker check --base <ref>` runs the same verification as part of the check. The GitHub Action passes the pull request's base commit, so a pull request that regenerates the baseline with `migration-tracker baseline create --force` to sneak in new sites fails CI. Approved additions belong in [exceptions or inline suppressions](exceptions.md), which are visible, have a reason, and in the case of exceptions, expire.

## Lifecycle

1. `migration-tracker baseline create`: record current sites. Commit `.migrations/baseline.json`.
2. `migration-tracker check`: on every pull request. Sites in the baseline pass, new sites in `ratchet` groups fail.
3. Someone removes a legacy import. `check` passes and counts the site as retired.
4. `migration-tracker baseline update`: drop retired sites from the baseline. Commit.

The text summary line shows all three numbers:

```
Legacy sites: 108 remaining | 12 retired | 1 new violation
```

Retired sites are entries in the baseline whose group still exists but that no longer appear in the code, in files that have no other site of that group. An entry stays in the baseline while its file still imports anything from its group, because that entry is what allows the file's other imports of the group. They do not fail the check. They are a prompt to run `baseline update`. With `--changed-since`, retired sites are only computed for the files that were scanned.

You can run `baseline update` on a schedule or as part of the pull request that removes the import. Either way it can only shrink the baseline.

## Known limitations

These are deliberate trade-offs.

- **File moves and renames look like a retired site plus a new one.** The file path is part of the id, so moving `src/a.ts` to `src/b.ts` retires `…|src/a.ts|…` and adds `…|src/b.ts|…`, which fails a `ratchet` check. Options: migrate the import as part of the move, add an inline suppression with a reason, or add an exception. Regenerating the baseline with `--force` is caught by `--base` verification.
- **Copied code is new code.** Copying a file with a legacy import into a new file creates a new site, even though no new dependency was introduced. This is intentional.
- **More imports in an allowed file are not caught.** A file that is allowed any site in a group can import that group's packages again, or other packages of the same group, without failing. The ratchet tracks which files depend on a group, not how many statements or specifiers they use.
- **Dynamically constructed specifiers are not detected.** `require(name)`, `` import(`./locale/${lang}`) `` and similar calls are ignored. Only string literals and template literals without substitutions are counted.
- **Matching uses the specifier as written, not the resolved path.** dependency-cruiser resolves `tsconfig` `paths` and bundler aliases when it is given a tsconfig (`--ts-config`, or `options.tsConfig` in a `--depcruise-config` file, or your own config in plugin mode). That resolution only helps it classify imports, for example as type-only. It never decides which group a site belongs to. If `@/date` is an alias for a wrapper around `moment`, imports of `@/date` are not counted; the imports of `moment` inside the wrapper are. Matching works this way so the ESLint rule, which has no resolver, gives the same answer, and so results do not depend on `node_modules` being installed or on workspace packages resolving to source files.
- **Imports inside `declare module` blocks.** dependency-cruiser only reads top-level import declarations, so `import` statements inside a `declare module 'x' { ... }` block in a `.ts` file are not counted by the default engine. The ESLint rule and `--engine scanner` do count them. Declaration files (`.d.ts`) are never scanned.
- **`typeof import('x')` of an unresolvable package.** dependency-cruiser normally skips type-position `import()` types, but when `x` cannot be resolved (for example because dependencies are not installed) it reports one as an ordinary import. The site counts and `check` warns "position unavailable". Install dependencies before running the CLI in CI.
- **Re-export barrels count at the barrel.** `export * from 'redux-form'` in `src/lib/forms.ts` is one site in `src/lib/forms.ts`. Files that import from `./lib/forms` are not counted. A barrel can hide how widely a legacy package is used, so prefer migrating barrels early or listing them as an internal legacy package.
- **One policy per repository.** A single `migrations.json` at the root. No per-package policies.
- **JavaScript and TypeScript only.** CSS, Vue and Svelte single-file components, and other languages are not scanned.
