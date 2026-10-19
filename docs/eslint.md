# ESLint plugin

`eslint-plugin-legacy-ratchet` shows new legacy imports in the editor, before CI does. It reads the same `legacy.json` and `.legacy/baseline.json` as the CLI and uses the same matching and identity rules.

The plugin is for feedback. CI should still run `legacy check`, which is the source of truth: it also reports retired sites, expired exceptions, and baseline additions, which the ESLint rule does not.

## Setup

Requires ESLint 9 or later with flat config.

```sh
pnpm add -D eslint-plugin-legacy-ratchet
```

```js
// eslint.config.js
import tsParser from '@typescript-eslint/parser';
import legacyRatchet from 'eslint-plugin-legacy-ratchet';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: { parser: tsParser },
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ...legacyRatchet.configs.recommended,
  },
];
```

`configs.recommended` registers the plugin as `legacy-ratchet` and turns on `legacy-ratchet/no-legacy-imports` at `error`. It sets no `files` pattern, so ESLint applies it to the files it lints by default. Add a `files` pattern as above to cover TypeScript, and configure a parser that understands your syntax (for example `@typescript-eslint/parser` for TypeScript).

To configure the rule yourself instead:

```js
export default [
  {
    plugins: { 'legacy-ratchet': legacyRatchet },
    rules: { 'legacy-ratchet/no-legacy-imports': 'warn' },
  },
];
```

## Rule: `no-legacy-imports`

Reports each import of a legacy package that `legacy check` would report as a violation:

- `ratchet` groups: imports whose site id is not in the baseline.
- `ban` groups: every import.
- `report` groups: nothing.

Sites are file-level, as in `legacy check`: every import of the same specifier with the same module system in a file is one site (`import`, `export … from` and `import()` share one; `require` and `import x = require()` share another). So a second import of a baselined specifier in the same file is not reported, but a new subpath is. When a site is a violation, the rule reports every occurrence of it, except occurrences whose own comment suppresses the group. A site is suppressed only when all of its occurrences are, so one comment never covers other imports of the same specifier.

Suppressed sites (inline comment with a reason) and sites covered by a non-expired exception are not reported.

Until `.legacy/baseline.json` exists, `ratchet` groups report nothing in the editor, so adopting the policy doesn't flood every open file with errors. Only `ban` groups report. `legacy check` is stricter here: with a `ratchet` group and no baseline, it exits 2.

Files matched by `ignore` in `legacy.json` are skipped. The CLI parses every `.js` file as JSX, so if your `.js` files contain JSX, configure a JSX-capable parser for them in ESLint as well.

The message for a new import is:

```
New import of "redux-form" is not allowed (forms). Use "react-hook-form" instead. See https://engineering.example.com/migrations/forms
```

With several replacements it reads `Use "a" or "b" instead.` The replacement sentence is omitted when the group's `new` list is empty and the link when there is no `docs`.

The ESLint severity in your config (`error`, `warn`, `off`) controls how the rule reports. The `enforcement.severity` field in `legacy.json` applies to the CLI.

### Options

```js
rules: {
  'legacy-ratchet/no-legacy-imports': ['error', { root: '.', configPath: 'legacy.json', baselinePath: '.legacy/baseline.json' }],
}
```

| Option | Description |
|---|---|
| `root` | Repository root. File paths in site ids are relative to it. Default: the nearest directory above the linted file that contains `legacy.json`. |
| `configPath` | Path to `legacy.json`. |
| `baselinePath` | Path to the baseline file. |

Behavior:

- If no `legacy.json` is found, the rule does nothing.
- If `legacy.json` is invalid, the rule reports one problem at the top of each file listing the validation issues, instead of crashing ESLint. Run `legacy validate` for details.
- Config and baseline are cached by path and modification time, so edits are picked up without restarting the editor's ESLint server.

## Parity with the CLI

The rule builds import sites from the ESLint AST and computes ids with the same core functions as the CLI, so a file produces the same ids in both. Because ESLint sees the file as it is in the editor, an unsaved or uncommitted change can show a violation the CLI has not seen yet. That is the point.

One known difference: imports inside a `declare module '...' { }` block in a `.ts` file are counted by the rule and by `legacy check --engine scanner`, but not by the default dependency-cruiser engine, which only reads top-level imports. See [ratcheting.md](ratcheting.md#known-limitations).
