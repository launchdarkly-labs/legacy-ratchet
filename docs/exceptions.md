# Exceptions and suppressions

Sometimes a new legacy import is the right call: a hotfix in a frozen module, a vendored script, a dependency the replacement cannot cover yet. legacy-ratchet gives you two ways to allow one, and both leave a record with a reason. Neither involves editing the baseline. The baseline only shrinks, and `--base` verification rejects additions to it.

| | Inline suppression | Exception |
|---|---|---|
| Where | Comment next to the import | `exceptions` in `legacy.json` |
| Covers | One import statement (a site needs all of its imports covered) | One group, files matching globs |
| Requires | A reason | A reason, an owner, an expiry date |
| Expires | No | Yes. Expired exceptions fail the check. |
| Works in `ban` groups | Yes | Yes |
| Use for | One-off, well-understood cases | Whole files or directories, time-boxed |

## Inline suppressions

```ts
// legacy-ratchet-disable-next-line dates -- fiscal-week math needs moment's isoWeek until DATA-142
import moment from 'moment';
```

```ts
const request = require('request'); // legacy-ratchet-disable-line http -- one-off fixture script
```

- `legacy-ratchet-disable-next-line` goes on the line directly above the import statement. `legacy-ratchet-disable-line` goes at the end of the same line.
- List group ids after the directive, separated by commas, to limit it to those groups. Without group ids it applies to every group. Naming the group is recommended so the suppression does not hide imports from other groups.
- The text after `--` is the reason, and it is required. A suppression with no reason does not suppress the import, and `legacy check` prints it as a warning.
- `/* ... */` block comments work too.

Suppressed imports never fail a check. They are still legacy usage: `legacy scan` lists them, and `legacy check --format json` reports `suppressedCount`.

### Suppressions on file-level sites

A site is every import of one specifier with one module system in a file (see [ratcheting.md](ratcheting.md#import-site-identity)), but a comment covers one import statement. So a site counts as suppressed only when every one of its imports has a suppression for the group with a reason:

```ts
// legacy-ratchet-disable-next-line dates -- fiscal-week math needs moment's isoWeek until DATA-142
import moment from 'moment';
import { duration } from 'moment';
```

Here the second import has no comment, so the `moment` site in this file is not suppressed. If it is new, `legacy check` reports it at the first unsuppressed import (line 3), and the ESLint rule marks only that import. Add a comment to each import, or merge them into one statement.

This is deliberate. If one comment suppressed the whole site, anyone could later add more imports of the package to that file and the check would never see them.

`suppressedCount` counts suppressed sites, not comments. A suppression with an empty reason is never honoured and is printed as a warning.

## Exceptions

```json
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
```

All fields except `issue` are required. `expires` is a `YYYY-MM-DD` date. Globs are relative to the repository root and match dotfiles. See [configuration.md](configuration.md#exceptions) for validation rules.

Sites of `groupId` in matching files never fail a check, in any mode. `legacy check --format json` reports `exceptedCount`.

### Expiry

An exception is valid through its expiry date and expires the next day (UTC). After that:

- It no longer excuses any site, so those sites are evaluated normally.
- Its presence alone makes `legacy check` exit 1. The text output lists each expired exception, and the JSON output includes it in `expiredExceptions`.

This is deliberate. An expired exception means a promise was missed, and someone has to decide: finish the migration, remove the exception, or renew it with a new date and a reason. The failure lands on whoever next touches the repository, so keep `owner` accurate.

## Who approves

legacy-ratchet does not manage approvals. Use code review:

- Put `legacy.json` and `.legacy/` under `CODEOWNERS`, owned by the platform team or the group owners. Adding or extending an exception then requires their review.
- Suppressions live in ordinary source files, so they are reviewed with the change that adds them. To make them easy to find, search for `legacy-ratchet-disable`.
- Keep the `owner` field on each group (in `legacy.json`) pointing at the team responsible for the migration. They are the default approvers for exceptions in that group.

A reasonable policy:

1. Prefer the replacement package.
2. If that is not possible right now, add an inline suppression naming the group, with a reason that links to a ticket.
3. For a whole file or directory, or anything that should end by a date, ask the group owner for an exception with an expiry no more than one or two quarters out.
4. Never edit `.legacy/baseline.json` by hand to allow a site.

## Reporting

- `legacy check` (text) lists expired exceptions and suppressions without a reason.
- `legacy check --format json` includes `expiredExceptions`, `suppressedCount`, and `exceptedCount`.
- `legacy scan` lists every site, including suppressed and excepted ones.
- `legacy report` counts all sites, so suppressions and exceptions do not make the migration look further along than it is.
