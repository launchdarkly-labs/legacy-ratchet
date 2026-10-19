# dependency-cruiser

migration-tracker uses [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) (depcruise) to find imports. There are two ways to run it:

1. **CLI engine.** `migration-tracker check`, `scan`, `report` and the `baseline` commands run depcruise themselves. This is the default and needs no setup.
2. **Reporter plugin.** If you already run depcruise, for example to validate architecture rules, you can run migration-tracker as an output plugin of your own depcruise run. Your config, resolve settings and cache are used as they are.

Both modes produce the same site ids as each other, as `--engine scanner`, and as the [ESLint rule](eslint.md). Ids are file-level because depcruise merges duplicate imports and reports no positions; see [ratcheting.md](ratcheting.md#why-file-level).

## Mode 1: CLI engine

Nothing to configure. The CLI lists files the same way as `--engine scanner`, keeps only those whose text mentions an `old` package, and asks depcruise for their imports with settings that find every import: `tsPreCompilationDeps: true`, ES modules and CommonJS, and no following into other files. It then runs its own scanner on the files with legacy imports to add line numbers and read suppression comments.

Options and environment variables (`--engine`, `--depcruise-config`, `--ts-config`, `--cache`, `--no-prefilter`) are described in [configuration.md](configuration.md#import-extraction-engine). The CLI does not read `.dependency-cruiser.js` unless you pass it with `--depcruise-config`, and it takes only resolve-related options from it.

## Mode 2: reporter plugin

```sh
depcruise --config .dependency-cruiser.js \
  --output-type "plugin:$(migration-tracker depcruise-plugin-path)" \
  src
```

`migration-tracker depcruise-plugin-path` prints the absolute path of the plugin file inside the installed CLI (`dist/depcruise-plugin.js`). The plugin is also exported as `@migration-tracker/cli/depcruise-plugin`, but pass the absolute path to depcruise: it imports plugins from its own install directory, and under pnpm's strict layout that directory cannot see your project's dev dependencies. A relative path fails the same way, with `ERROR: Could not find reporter plugin`.

The plugin replaces depcruise's output for that run. It prints the same output as `migration-tracker check` and returns the same exit code. It checks only the files depcruise cruised: baseline entries for other files are neither retired nor reported. To check a subset, pass only those paths to depcruise.

The plugin does not verify the baseline against a base ref. Run `migration-tracker baseline verify --base <ref>` separately in CI.

### Required depcruise options

The plugin uses whatever your run produced, so the run must not drop imports. It exits 2 with an explanation when it can tell the options are wrong.

| Option | Requirement |
|---|---|
| `tsPreCompilationDeps` | Must be `true`. Otherwise type-only imports are dropped. `false` and `"specify"` exit 2. |
| `includeOnly` | Don't set it, or make it match paths under `node_modules`. depcruise applies it to resolved paths, so an `includeOnly` like `^src` drops every import of an installed package. The plugin exits 2. |
| `exclude` | Must not match paths under `node_modules`, for the same reason. Use `doNotFollow: { path: 'node_modules' }` instead. The plugin exits 2. |
| `maxDepth` | Leave it unset. With `maxDepth: 1` and `doNotFollow: node_modules`, a file that another cruised file imports is visited first as a dependency, without its own imports, and then skipped, so its imports silently disappear. The plugin cannot detect this. |

A minimal config:

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
  },
};
```

`focus`, `reaches`, `collapse` and `affected` can also distort the result and are not checked.

### Configuration

| Variable | Description |
|---|---|
| `MIGRATION_TRACKER_CONFIG` | Path to `migrations.json`, absolute or relative to the current directory. Its directory is the root. Without it, the plugin looks for `migrations.json` in depcruise's `baseDir` (default: the current directory) and its parents. |
| `MIGRATION_TRACKER_FORMAT` | `text` (default), `json`, `markdown` or `github`, as in `migration-tracker check --format`. Any other value exits 2. |
| `GITHUB_STEP_SUMMARY` | With the `github` format, the markdown summary is appended to this file, as the CLI does. |
| `MIGRATION_TRACKER_REPORT` | Also write a report: a path ending in `.json` writes a snapshot, `.html` writes the [dashboard](dashboard.md). Relative to the current directory. Any other extension adds a warning to the output. |
| `NO_COLOR`, `FORCE_COLOR` | Text output is colored on a TTY. `NO_COLOR` turns color off and `FORCE_COLOR` turns it on. |

The baseline is read from `.migrations/baseline.json` under the root. If a `ratchet` group has no baseline, the plugin exits 2. Create the baseline with the CLI (`migration-tracker baseline create`); the plugin never writes it.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | No failing violations. |
| `1` | The check failed: a new or banned import with severity `error`, or an expired exception. |
| `2` | No `migrations.json`, an invalid config or baseline, a missing baseline, an unknown `MIGRATION_TRACKER_FORMAT`, or depcruise options that drop imports. The output starts with `migration-tracker:` and says what to fix. |

### One output type per run

depcruise produces one output type per run, so the plugin cannot share a run with `--output-type err` or any other reporter. If you also validate rules, run depcruise twice and point both runs at the same `--cache` folder so the second run can reuse the first one's work. Whether the cache is reused across output types has not been verified.

## TypeScript must be resolvable

depcruise needs the `typescript` package to see type-only imports and `import x = require()`. It loads it from its own install directory, not from yours. If it can't, it falls back to a JavaScript parser and can miss those imports, which then look retired.

- The CLI engine checks this and warns: `dependency-cruiser cannot load typescript; type-only and import-equals detection is degraded`.
- The plugin cannot check it. Run `depcruise --info` and look for a ✔ next to `typescript`.

Fix it by making `typescript` resolvable from dependency-cruiser's directory. A `typescript` dev dependency in the same project as `dependency-cruiser` usually works. With pnpm and hoisting turned off, add `typescript` to `public-hoist-pattern`.

## Recipe: add the plugin to an existing depcruise setup

If your repository already runs dependency-cruiser, check that its config passes the plugin's checks: `tsPreCompilationDeps: true`, no `includeOnly`, and no `exclude` that matches `node_modules`.

1. Add a `migrations.json` at the repository root, then create and commit a baseline:

   ```sh
   migration-tracker validate
   migration-tracker baseline create
   ```

   The CLI scans every JS and TS file under the root, so list directories your depcruise run doesn't cover under `ignore`.

2. Run the plugin inside your own depcruise run:

   ```sh
   depcruise --output-type "plugin:$(migration-tracker depcruise-plugin-path)" src
   ```

   depcruise picks up its config from the repository root, and the plugin finds `migrations.json` there.

In CI, run the same command with `MIGRATION_TRACKER_FORMAT=github`. If the job already restores a depcruise cache, pass the same `--cache` arguments so the run can reuse it. Add a `migration-tracker baseline verify --base <base sha>` step next to it.
