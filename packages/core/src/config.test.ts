import { describe, expect, it } from 'vitest';
import { configDigest, parseConfig, validateConfig } from './index.js';
import type { ValidationIssue } from './index.js';

const base = (groups: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, groups, ...extra });

function issuesOf(input: unknown): ValidationIssue[] {
  const result = validateConfig(input);
  if (result.ok) throw new Error('expected validation to fail');
  return result.issues;
}

const validException = { groupId: 'forms', files: ['src/**'], reason: 'migration in flight', owner: '@team', expires: '2030-01-31' };

describe('validateConfig', () => {
  it('applies enforcement defaults and new: []', () => {
    const result = validateConfig(base({ forms: { old: ['redux-form'] } }));
    expect(result).toEqual({
      ok: true,
      issues: [],
      config: {
        version: 1,
        groups: {
          forms: { old: ['redux-form'], new: [], enforcement: { mode: 'report', scope: 'imports', severity: 'error' } },
        },
      },
    });
  });

  it('defaults each enforcement field individually', () => {
    const result = validateConfig(base({ forms: { old: ['redux-form'], new: ['react-hook-form'], enforcement: { mode: 'ratchet' } } }));
    expect(result.ok && result.config.groups.forms?.enforcement).toEqual({ mode: 'ratchet', scope: 'imports', severity: 'error' });
    const warn = validateConfig(base({ forms: { old: ['redux-form'], enforcement: { severity: 'warn' } } }));
    expect(warn.ok && warn.config.groups.forms?.enforcement).toEqual({ mode: 'report', scope: 'imports', severity: 'warn' });
  });

  it('keeps optional fields, $schema, ignore and exceptions', () => {
    const input = base(
      {
        forms: {
          description: 'Forms',
          owner: '@forms',
          old: ['redux-form', '@company/legacy-forms'],
          new: ['react-hook-form'],
          docs: 'https://example.com/forms',
          enforcement: { mode: 'ban', scope: 'imports', severity: 'warn' },
        },
      },
      { $schema: './node_modules/@legacy-ratchet/core/schema.json', ignore: ['**/*.stories.tsx'], exceptions: [validException] },
    );
    const result = validateConfig(input);
    expect(result.ok).toBe(true);
    expect(result.ok && result.config).toEqual(input);
  });

  it('rejects wrong version and missing groups', () => {
    expect(issuesOf({ version: 2, groups: { a: { old: ['x'] } } }).map((i) => i.path)).toEqual(['version']);
    expect(issuesOf({ version: 1 }).map((i) => i.path)).toEqual(['groups']);
  });

  it('requires at least one group', () => {
    expect(issuesOf(base({}))).toEqual([{ path: 'groups', message: 'At least one group is required' }]);
  });

  it('rejects invalid group ids', () => {
    for (const id of ['Forms', '-forms', '_x', 'a b', 'a.b']) {
      expect(issuesOf(base({ [id]: { old: ['x'] } }))[0]?.path).toBe(`groups.${id}`);
    }
    expect(validateConfig(base({ '0forms_v2-x': { old: ['x'] } })).ok).toBe(true);
  });

  it('requires non-empty old of valid package names without subpaths', () => {
    expect(issuesOf(base({ a: { old: [] } })).map((i) => i.path)).toEqual(['groups.a.old']);
    expect(issuesOf(base({ a: {} })).map((i) => i.path)).toEqual(['groups.a.old']);
    expect(issuesOf(base({ a: { old: ['lodash/fp'] } })).map((i) => i.path)).toEqual(['groups.a.old[0]']);
    expect(issuesOf(base({ a: { old: ['ok', '@scope/name/sub'] } })).map((i) => i.path)).toEqual(['groups.a.old[1]']);
    expect(issuesOf(base({ a: { old: ['Upper'] } })).map((i) => i.path)).toEqual(['groups.a.old[0]']);
    expect(issuesOf(base({ a: { old: ['./rel'] } })).map((i) => i.path)).toEqual(['groups.a.old[0]']);
    expect(issuesOf(base({ a: { old: ['x'], new: ['bad/sub'] } })).map((i) => i.path)).toEqual(['groups.a.new[0]']);
    expect(validateConfig(base({ a: { old: ['@company/legacy-forms', 'lodash.get', 'node-sass'] } })).ok).toBe(true);
  });

  it('rejects invalid enforcement values and scope other than imports', () => {
    expect(issuesOf(base({ a: { old: ['x'], enforcement: { mode: 'block' } } })).map((i) => i.path)).toEqual([
      'groups.a.enforcement.mode',
    ]);
    expect(issuesOf(base({ a: { old: ['x'], enforcement: { scope: 'files' } } })).map((i) => i.path)).toEqual([
      'groups.a.enforcement.scope',
    ]);
    expect(issuesOf(base({ a: { old: ['x'], enforcement: { severity: 'info' } } })).map((i) => i.path)).toEqual([
      'groups.a.enforcement.severity',
    ]);
  });

  it('requires docs to be a URL', () => {
    expect(issuesOf(base({ a: { old: ['x'], docs: 'see wiki' } }))).toEqual([{ path: 'groups.a.docs', message: 'Must be a URL' }]);
  });

  it('rejects unknown top-level, group and enforcement keys', () => {
    expect(issuesOf(base({ a: { old: ['x'] } }, { extra: true }))).toEqual([{ path: 'extra', message: 'Unknown key "extra"' }]);
    expect(issuesOf(base({ a: { old: ['x'], olds: [] } }))).toEqual([{ path: 'groups.a.olds', message: 'Unknown key "olds"' }]);
    expect(issuesOf(base({ a: { old: ['x'], enforcement: { level: 1 } } })).map((i) => i.path)).toEqual([
      'groups.a.enforcement.level',
    ]);
  });

  describe('conflicts', () => {
    it('same package in old of two groups', () => {
      expect(issuesOf(base({ a: { old: ['x'] }, forms: { old: ['y', 'x'] } }))).toEqual([
        { path: 'groups.forms.old[1]', message: 'Package "x" is already listed in old of group "a"' },
      ]);
    });

    it('package in some old and some new (same or other group)', () => {
      expect(issuesOf(base({ a: { old: ['x'] }, b: { old: ['y'], new: ['x'] } }))).toEqual([
        { path: 'groups.b.new[0]', message: 'Package "x" cannot be both new here and old in group "a"' },
      ]);
      expect(issuesOf(base({ b: { old: ['y'], new: ['z'] }, a: { old: ['z'] } })).map((i) => i.path)).toEqual(['groups.b.new[0]']);
      expect(issuesOf(base({ a: { old: ['x'], new: ['x'] } })).map((i) => i.path)).toEqual(['groups.a.new[0]']);
    });

    it('duplicates within an array', () => {
      expect(issuesOf(base({ forms: { old: ['x', 'x'] } }))).toEqual([{ path: 'groups.forms.old[1]', message: 'Duplicate package "x"' }]);
      expect(issuesOf(base({ forms: { old: ['x'], new: ['y', 'z', 'y'] } }))).toEqual([
        { path: 'groups.forms.new[2]', message: 'Duplicate package "y"' },
      ]);
    });

    it('allows the same new package in several groups', () => {
      expect(validateConfig(base({ a: { old: ['x'], new: ['z'] }, b: { old: ['y'], new: ['z'] } })).ok).toBe(true);
    });
  });

  describe('exceptions', () => {
    const withException = (e: Record<string, unknown>) => base({ forms: { old: ['x'] } }, { exceptions: [{ ...validException, ...e }] });

    it('accepts a valid exception with optional issue', () => {
      expect(validateConfig(withException({ issue: 'JIRA-1' })).ok).toBe(true);
    });

    it('groupId must reference an existing group', () => {
      expect(issuesOf(withException({ groupId: 'nope' }))).toEqual([{ path: 'exceptions[0].groupId', message: 'Unknown group "nope"' }]);
    });

    it('expires must be YYYY-MM-DD and a real date', () => {
      expect(issuesOf(withException({ expires: '2030-1-31' }))).toEqual([
        { path: 'exceptions[0].expires', message: 'Must be a date in YYYY-MM-DD format' },
      ]);
      expect(issuesOf(withException({ expires: '2030-02-30' }))).toEqual([
        { path: 'exceptions[0].expires', message: 'Must be a real calendar date' },
      ]);
      expect(issuesOf(withException({ expires: '2030-13-01' })).map((i) => i.path)).toEqual(['exceptions[0].expires']);
      expect(issuesOf(withException({ expires: '2030-01-31T00:00:00Z' })).map((i) => i.path)).toEqual(['exceptions[0].expires']);
      expect(validateConfig(withException({ expires: '2028-02-29' })).ok).toBe(true);
      expect(issuesOf(withException({ expires: '2027-02-29' })).map((i) => i.path)).toEqual(['exceptions[0].expires']);
    });

    it('files must be a non-empty array of non-empty globs', () => {
      expect(issuesOf(withException({ files: [] })).map((i) => i.path)).toEqual(['exceptions[0].files']);
      expect(issuesOf(withException({ files: ['src/**', ''] })).map((i) => i.path)).toEqual(['exceptions[0].files[1]']);
    });

    it('reason and owner must be non-empty', () => {
      expect(issuesOf(withException({ reason: '' })).map((i) => i.path)).toEqual(['exceptions[0].reason']);
      expect(issuesOf(withException({ reason: '   ' })).map((i) => i.path)).toEqual(['exceptions[0].reason']);
      expect(issuesOf(withException({ owner: '' })).map((i) => i.path)).toEqual(['exceptions[0].owner']);
      const { owner: _owner, ...noOwner } = validException;
      expect(issuesOf(base({ forms: { old: ['x'] } }, { exceptions: [noOwner] })).map((i) => i.path)).toEqual(['exceptions[0].owner']);
    });

    it('rejects unknown exception keys', () => {
      expect(issuesOf(withException({ expire: '2030-01-01' }))).toEqual([{ path: 'exceptions[0].expire', message: 'Unknown key "expire"' }]);
    });
  });

  it('ignore must be an array of non-empty globs', () => {
    expect(issuesOf(base({ a: { old: ['x'] } }, { ignore: 'dist' })).map((i) => i.path)).toEqual(['ignore']);
    expect(issuesOf(base({ a: { old: ['x'] } }, { ignore: [''] })).map((i) => i.path)).toEqual(['ignore[0]']);
  });

  it('rejects non-object input', () => {
    expect(issuesOf(null).map((i) => i.path)).toEqual(['']);
    expect(issuesOf([]).map((i) => i.path)).toEqual(['']);
  });
});

describe('parseConfig', () => {
  it('parses valid JSON', () => {
    expect(parseConfig(JSON.stringify(base({ a: { old: ['x'] } }))).ok).toBe(true);
  });

  it('turns JSON errors into an issue at path ""', () => {
    const result = parseConfig('{ nope');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues).toHaveLength(1);
    expect(!result.ok && result.issues[0]?.path).toBe('');
    expect(!result.ok && result.issues[0]?.message).toMatch(/^Invalid JSON: /);
  });
});

describe('configDigest', () => {
  const parse = (input: unknown) => {
    const r = validateConfig(input);
    if (!r.ok) throw new Error('invalid');
    return r.config;
  };

  it('is sha256 of stable-key-sorted JSON of {version, groups}', async () => {
    const { createHash } = await import('node:crypto');
    const cfg = parse(base({ a: { old: ['x'], new: [] } }));
    const json = '{"groups":{"a":{"enforcement":{"mode":"report","scope":"imports","severity":"error"},"new":[],"old":["x"]}},"version":1}';
    expect(configDigest(cfg)).toBe(`sha256:${createHash('sha256').update(json).digest('hex')}`);
  });

  it('ignores key order, $schema, ignore and exceptions', () => {
    const a = parse({ version: 1, groups: { g: { old: ['x'], new: ['y'], enforcement: { mode: 'ratchet' } } } });
    const b = parse({
      $schema: 'x',
      ignore: ['dist/**'],
      exceptions: [{ ...validException, groupId: 'g' }],
      groups: { g: { enforcement: { severity: 'error', mode: 'ratchet' }, new: ['y'], old: ['x'] } },
      version: 1,
    });
    expect(configDigest(a)).toBe(configDigest(b));
  });

  it('changes when policy changes', () => {
    const a = parse(base({ g: { old: ['x'] } }));
    const b = parse(base({ g: { old: ['x'], enforcement: { mode: 'ban' } } }));
    expect(configDigest(a)).not.toBe(configDigest(b));
    expect(configDigest(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('progress fields', () => {
  const group = (extra: Record<string, unknown>) => base({ forms: { old: ['redux-form'], ...extra } });

  it('keeps a valid start', () => {
    const result = validateConfig(group({ start: 120 }));
    expect(result.ok && result.config.groups.forms).toMatchObject({ start: 120 });
    expect(validateConfig(group({ start: 0 })).ok).toBe(true);
    const plain = validateConfig(group({}));
    expect(plain.ok && plain.config.groups.forms).not.toHaveProperty('start');
  });

  it('rejects target (unknown key)', () => {
    expect(issuesOf(group({ target: '2027-06-30' }))).toEqual([{ path: 'groups.forms.target', message: 'Unknown key "target"' }]);
  });

  it('start must be an integer of at least 0', () => {
    expect(issuesOf(group({ start: -1 }))).toEqual([{ path: 'groups.forms.start', message: 'Must be at least 0' }]);
    expect(issuesOf(group({ start: 1.5 }))).toEqual([{ path: 'groups.forms.start', message: 'Must be an integer' }]);
    expect(issuesOf(group({ start: '10' })).map((i) => i.path)).toEqual(['groups.forms.start']);
  });
});
