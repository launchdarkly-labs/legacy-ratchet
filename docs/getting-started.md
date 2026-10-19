# Getting started

This guide takes a repository from nothing to an enforced migration in seven steps. It assumes Node 20.12 or later and a JavaScript or TypeScript codebase.

Install the CLI as a dev dependency so `migrations.json` can point at the bundled JSON schema:

```sh
pnpm add -D @migration-tracker/cli
```

The CLI installs two equivalent binaries, `migration-tracker` and `mt`. The examples below use `migration-tracker`.

## 1. Create a policy file

```sh
pnpm exec migration-tracker init
```

This writes two files:

- `migrations.json`: a sample policy with one group in `report` mode and `"$schema": "./node_modules/@migration-tracker/core/schema.json"` for editor completion.
- `.migrations/README.md`: a short explanation of the workflow for your teammates.

`init` refuses to overwrite an existing `migrations.json` and exits 2. Pass `--force` to overwrite.

If your root `package.json` depends on well-known legacy candidates (`moment`, `request`, `enzyme`, `redux-form`, `tslint`, `node-sass`, or `lodash`), `init` prints suggestions to stdout. It does not add them to the file. You decide what is deprecated.

## 2. Declare what is deprecated

Edit `migrations.json`. Each group names the packages being retired (`old`), what replaces them (`new`), and how strictly to enforce it:

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

Check it:

```sh
pnpm exec migration-tracker validate
```

Invalid configs print one `path: message` line per issue and exit 2. See [configuration.md](configuration.md) for every field.

To see what migration-tracker finds before committing to anything:

```sh
pnpm exec migration-tracker scan
```

## 3. Create and commit a baseline

```sh
pnpm exec migration-tracker baseline create
git add migrations.json .migrations/
git commit -m "Adopt migration-tracker"
```

`baseline create` scans the repository and writes every current legacy import site to `.migrations/baseline.json`. These are the existing usages you are allowed to keep for now. It refuses to overwrite an existing baseline unless you pass `--force`.

Review the baseline like any other change. It is the list of debt you are agreeing to carry.

## 4. Enable the ESLint rule and CI

Editor feedback comes from the ESLint plugin. Add the recommended config to `eslint.config.js` (ESLint 9 flat config):

```js
import migrationTracker from 'eslint-plugin-migration-tracker';

export default [
  migrationTracker.configs.recommended,
];
```

See [eslint.md](eslint.md) for options and parser setup.

Enforcement comes from CI. With GitHub Actions:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: <owner>/migration-tracker@<commit-sha>
```

Or run the CLI directly in any CI system:

```sh
pnpm exec migration-tracker check --base origin/main
```

See [ci.md](ci.md).

## 5. Existing usages pass, new ones fail

`migration-tracker check` compares the current import sites against the baseline:

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
pnpm exec migration-tracker baseline update
git add .migrations/baseline.json
git commit -m "Ratchet migration-tracker baseline"
```

`baseline update` only removes entries. It never adds a site, so the baseline can only shrink. `migration-tracker check --format markdown` reminds you to run it when there are retired sites. See [ratcheting.md](ratcheting.md).

## 7. Report progress

```sh
pnpm exec migration-tracker report --format html --append-history
```

This writes `migration-report.html`, a self-contained dashboard with progress and adoption per group, owners, the files with the fewest legacy imports to start with, and every import site.
