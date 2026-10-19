# Getting started

This guide takes a repository from nothing to an enforced migration in seven steps. It assumes Node 20.12 or later and a JavaScript or TypeScript codebase.

Install the CLI as a dev dependency so `legacy.json` can point at the bundled JSON schema:

```sh
pnpm add -D @legacy-ratchet/cli
```

The CLI installs two equivalent binaries, `legacy` and `legacy-ratchet`. The examples below use `legacy`.

## 1. Create a policy file

```sh
pnpm exec legacy init
```

This writes two files:

- `legacy.json`: a sample policy with one group in `report` mode and `"$schema": "./node_modules/@legacy-ratchet/core/schema.json"` for editor completion.
- `.legacy/README.md`: a short explanation of the workflow for your teammates.

`init` refuses to overwrite an existing `legacy.json` and exits 2. Pass `--force` to overwrite.

If your root `package.json` depends on well-known legacy candidates (`moment`, `request`, `enzyme`, `redux-form`, `tslint`, `node-sass`, or `lodash`), `init` prints suggestions to stdout. It does not add them to the file. You decide what is deprecated.

## 2. Declare what is deprecated

Edit `legacy.json`. Each group names the packages being retired (`old`), what replaces them (`new`), and how strictly to enforce it:

```json
{
  "$schema": "./node_modules/@legacy-ratchet/core/schema.json",
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

Check it:

```sh
pnpm exec legacy validate
```

Invalid configs print one `path: message` line per issue and exit 2. See [configuration.md](configuration.md) for every field.

To see what legacy-ratchet finds before committing to anything:

```sh
pnpm exec legacy scan
```

## 3. Create and commit a baseline

```sh
pnpm exec legacy baseline create
git add legacy.json .legacy/
git commit -m "Adopt legacy-ratchet"
```

`baseline create` scans the repository and writes every current legacy import site to `.legacy/baseline.json`. These are the existing usages you are allowed to keep for now. It refuses to overwrite an existing baseline unless you pass `--force`.

Review the baseline like any other change. It is the list of debt you are agreeing to carry.

## 4. Enable the ESLint rule and CI

Editor feedback comes from the ESLint plugin. Add the recommended config to `eslint.config.js` (ESLint 9 flat config):

```js
import legacyRatchet from 'eslint-plugin-legacy-ratchet';

export default [
  legacyRatchet.configs.recommended,
];
```

See [eslint.md](eslint.md) for options and parser setup.

Enforcement comes from CI. With GitHub Actions:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: <owner>/legacy-ratchet@<commit-sha>
```

Or run the CLI directly in any CI system:

```sh
pnpm exec legacy check --base origin/main
```

See [ci.md](ci.md).

## 5. Existing usages pass, new ones fail

`legacy check` compares the current import sites against the baseline:

- A site already in the baseline passes.
- A site not in the baseline, in a `ratchet` group, is a violation and the check exits 1.

```
✖ forms: src/features/checkout/PaymentForm.tsx:8
  New import of "redux-form" is not allowed.
  Preferred replacement: "react-hook-form"
  Migration guide: https://engineering.example.com/migrations/forms

Legacy sites: 108 remaining | 12 retired | 1 new violation
```

The developer can switch to the replacement, or, if the import is genuinely needed, add an inline suppression with a reason or ask the group owner for an exception. See [exceptions.md](exceptions.md).

## 6. Lock in progress as legacy imports disappear

When someone removes a legacy import, `check` still passes and reports the site as retired. The baseline still allows it, though, so someone could add it back. Tighten the baseline:

```sh
pnpm exec legacy baseline update
git add .legacy/baseline.json
git commit -m "Ratchet legacy baseline"
```

`baseline update` only removes entries. It never adds a site, so the baseline can only shrink. `legacy check --format markdown` reminds you to run it when there are retired sites. See [ratcheting.md](ratcheting.md).

## 7. Report progress

```sh
pnpm exec legacy report --format html --append-history
```

This writes `legacy-report.html`, a self-contained dashboard with remaining sites per group, top files, owners, and a trend line built from `.legacy/history.jsonl`. `--append-history` adds the current totals to that file. Run it on your main branch on a schedule to build the trend. See [dashboard.md](dashboard.md).
