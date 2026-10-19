# Example: Vite + React app

A small React app partway through three migrations. Nothing here installs or builds. It exists so you can run legacy-ratchet against a realistic tree, and it is the fixture this repository's CI checks itself against.

| Group | Old | New | Mode |
|---|---|---|---|
| `forms` | `redux-form` | `react-hook-form` | `ratchet` |
| `dates` | `moment` | `date-fns` | `ratchet` (with a migration guide URL) |
| `http` | `request`, `axios` | `ky` | `report` |

## What the source covers

| File | Case |
|---|---|
| `src/lib/dates.ts` | Legacy `moment` import next to modern `date-fns` imports |
| `src/components/DateLabel.tsx` | Type-only import (`import type { Moment } from 'moment'`). Type-only imports count. |
| `src/features/reports/exportCsv.ts` | Dynamic `import('moment')`. It shares the `import` kind with static imports, so its site id ends in `\|import\|moment`. |
| `src/features/reports/ReportFilters.tsx` | Inline suppression: `// legacy-ratchet-disable-next-line dates -- reason` |
| `src/lib/forms.ts` | Re-export barrel: `export * from 'redux-form'`. The site counts at the barrel. |
| `src/legacy/checkout/LegacyAddressForm.tsx` | Subpath import `redux-form/lib/Field` (matches `redux-form`), non-matching prefix `redux-form-extra` (does not match), and a file covered by the `forms` exception in `legacy.json` |
| `src/features/checkout/PaymentForm.tsx` | Modern `react-hook-form` only |
| `src/api/client.ts`, `src/api/uploads.ts` | `ky` (modern) and `axios` (legacy, report-only) |
| `scripts/fetch-fixtures.cjs` | CommonJS `require('request')` |
| `eslint.config.js` | `eslint-plugin-legacy-ratchet` recommended config |
| `.dependency-cruiser.cjs` | Minimal dependency-cruiser config for running legacy-ratchet as a reporter plugin |

legacy-ratchet finds 9 legacy import sites (file-level: one per file, package specifier and module system): 3 in `forms`, 4 in `dates`, 2 in `http`. One `dates` site is suppressed inline and two `forms` sites are covered by the exception.

## Baseline

`.legacy/baseline.json` is generated with the real CLI, not written by hand. From the repository root, after `pnpm build`:

```sh
node packages/cli/dist/bin.js baseline create --root examples/vite-react
node packages/cli/dist/bin.js check --root examples/vite-react
```

With the baseline in place, `check` exits 0 and ends with:

```
Legacy sites: 9 remaining | 0 retired | 0 new violations
```

Try it: add `import moment from 'moment';` to `src/features/checkout/PaymentForm.tsx` and run `check` again. It exits 1 and prints the new site. Delete the `moment` import from `src/lib/dates.ts` instead, and `check` passes and reports 1 retired site. Run `baseline update` to lock that in.

The `package.json` scripts (`legacy:check`, `legacy:scan`, `legacy:report`) run the same CLI from inside this directory.

The CLI uses dependency-cruiser by default. Add `--engine scanner` to any of the commands above to use the TypeScript scanner instead; the result is the same 9 sites.

## Reporter plugin

The same check can run inside a dependency-cruiser run, using `.dependency-cruiser.cjs`. From this directory, after `pnpm build` at the repository root:

```sh
DEPCRUISE=../../packages/depcruise/node_modules/.bin/depcruise
$DEPCRUISE --config .dependency-cruiser.cjs \
  --output-type "plugin:$(node ../../packages/cli/dist/bin.js depcruise-plugin-path)" \
  src scripts
```

It prints the same `Legacy sites: 9 remaining | 0 retired | 0 new violations` line and exits 0. The config sets `tsPreCompilationDeps: true` and `doNotFollow: { path: 'node_modules' }`, and deliberately has no `exclude` of `node_modules`; see [docs/depcruise.md](../../docs/depcruise.md) for why.
