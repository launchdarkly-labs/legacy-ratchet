# Example: pnpm monorepo

One `legacy.json` at the repository root governs every app and package. Paths in the baseline, in `ignore`, and in exception `files` globs are all relative to that root. Per-package policies are not supported in the MVP.

```
legacy.json              one policy for the whole repo
apps/web                 app that still uses moment and @acme/legacy-utils
packages/ui              shared components (one type-only moment import)
packages/legacy-utils    the internal package being retired
```

| Group | Old | New | Mode |
|---|---|---|---|
| `dates` | `moment` | `date-fns` | `ratchet` |
| `legacy-utils` | `@acme/legacy-utils` | none | `ratchet`, severity `warn` |
| `http` | `request`, `request-promise-native` | `ky` | `ban` |

Things to notice:

- **Scoped packages and subpaths.** `@acme/legacy-utils/dates` in `apps/web/src/pages/Settings.tsx` matches the `@acme/legacy-utils` entry.
- **Internal packages can be legacy too.** The `legacy-utils` group lists a workspace package, not an npm dependency. Its `new` list is empty, so violations print no replacement line.
- **`ignore`.** `**/__generated__/**` and `**/*.stories.tsx` are skipped, so `apps/web/src/__generated__/api.ts` and `packages/ui/src/DatePicker.stories.tsx` are not counted even though they import `moment`.
- **`ban` with an exception.** `ban` fails every site regardless of the baseline. The last `request` call site, `packages/legacy-utils/src/http.ts`, is allowed by a dated exception. Remove the exception and `check` fails.

legacy-ratchet finds 6 legacy sites: 3 in `dates`, 2 in `legacy-utils`, 1 in `http` (excepted).

## Baseline

`.legacy/baseline.json` is generated with the CLI. From the repository root, after `pnpm build`:

```sh
node packages/cli/dist/bin.js check --root examples/pnpm-monorepo
```

It exits 0 and ends with `Legacy sites: 6 remaining | 0 retired | 0 new violations`. To regenerate the baseline, run `baseline create --force --root examples/pnpm-monorepo`.

The default engine is dependency-cruiser. `@acme/legacy-utils` is a workspace package, but matching uses the specifier as written, so imports of it count whether or not it resolves. `--engine scanner` gives the same 6 sites. See [docs/depcruise.md](../../docs/depcruise.md).
